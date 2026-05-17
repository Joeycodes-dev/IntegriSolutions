#!/usr/bin/env python3
import argparse
import base64
import binascii
import re
import sys
from typing import Tuple, Optional, List

VERSION_1_128_PEM = '''-----BEGIN RSA PUBLIC KEY-----
MIGXAoGBAP7S4cJ+M2MxbncxenpSxUmBOVGGvkl0dgxyUY1j4FRKSNCIszLFsMNw
x2XWXZg8H53gpCsxDMwHrncL0rYdak3M6sdXaJvcv2CEePrzEvYIfMSWw3Ys9cRl
HK7No0mfrn7bfrQOPhjrMEFw6R7VsVaqzm9DLW7KbMNYUd6MZ49nAhEAu3l//ex/
nkLJ1vebE3BZ2w==
-----END RSA PUBLIC KEY-----'''

VERSION_1_74_PEM = '''-----BEGIN RSA PUBLIC KEY-----
MGACSwD/POxrX0Djw2YUUbn8+u866wbcIynA5vTczJJ5cmcWzhW74F7tLFcRvPj1
tsj3J221xDv6owQNwBqxS5xNFvccDOXqlT8MdUxrFwIRANsFuoItmswz+rfY9Cf5
zmU=
-----END RSA PUBLIC KEY-----'''

VERSION_2_128_PEM = '''-----BEGIN RSA PUBLIC KEY-----
MIGWAoGBAMqfGO9sPz+kxaRh/qVKsZQGul7NdG1gonSS3KPXTjtcHTFfexA4MkGA
mwKeu9XeTRFgMMxX99WmyaFvNzuxSlCFI/foCkx0TZCFZjpKFHLXryxWrkG1Bl9+
+gKTvTJ4rWk1RvnxYhm3n/Rxo2NoJM/822Oo7YBZ5rmk8NuJU4HLAhAYcJLaZFTO
sYU+aRX4RmoF
-----END RSA PUBLIC KEY-----'''

VERSION_2_74_PEM = '''-----BEGIN RSA PUBLIC KEY-----
MF8CSwC0BKDfEdHKz/GhoEjU1XP5U6YsWD10klknVhpteh4rFAQlJq9wtVBUc5Dq
bsdI0w/bga20kODDahmGtASy9dobZj5ZUJEw5wIQMJz+2XGf4qXiDJu0R2U4Kw==
-----END RSA PUBLIC KEY-----'''

KEYS = {
    (2, 128): VERSION_2_128_PEM,
    (2, 74): VERSION_2_74_PEM,
    (1, 128): VERSION_1_128_PEM,
    (1, 74): VERSION_1_74_PEM,
}


class RSAPublicKey:
    def __init__(self, modulus: int, exponent: int) -> None:
        self.n = modulus
        self.e = exponent


def parse_pem_public_key(pem_text: str) -> RSAPublicKey:
    body = ''.join(line.strip() for line in pem_text.splitlines() if line and 'BEGIN' not in line and 'END' not in line)
    der = base64.b64decode(body)
    return parse_rsa_public_key_der(der)


def parse_asn1_length(data: bytes, offset: int) -> Tuple[int, int]:
    if offset >= len(data):
        raise ValueError('Invalid ASN.1 length offset')
    first = data[offset]
    offset += 1
    if first & 0x80 == 0:
        return first, offset
    length_bytes = first & 0x7F
    if length_bytes == 0 or length_bytes > 4:
        raise ValueError('Unsupported ASN.1 length encoding')
    if offset + length_bytes > len(data):
        raise ValueError('ASN.1 length extends past data')
    value = int.from_bytes(data[offset:offset + length_bytes], 'big')
    return value, offset + length_bytes


def parse_rsa_public_key_der(der: bytes) -> RSAPublicKey:
    if not der or der[0] != 0x30:
        raise ValueError('Expected ASN.1 SEQUENCE for RSA public key')
    total_len, index = parse_asn1_length(der, 1)
    end_index = index + total_len
    if end_index != len(der):
        # trailing bytes are allowed in some outputs
        pass

    if der[index] != 0x02:
        raise ValueError('Expected INTEGER for modulus')
    mod_len, index = parse_asn1_length(der, index + 1)
    modulus = int.from_bytes(der[index:index + mod_len], 'big')
    index += mod_len

    if der[index] != 0x02:
        raise ValueError('Expected INTEGER for exponent')
    exp_len, index = parse_asn1_length(der, index + 1)
    exponent = int.from_bytes(der[index:index + exp_len], 'big')
    index += exp_len

    return RSAPublicKey(modulus, exponent)


def decrypt_rsa_block(block: bytes, key: RSAPublicKey) -> bytes:
    if len(block) == 0:
        return b''
    input_int = int.from_bytes(block, 'big', signed=False)
    output_int = pow(input_int, key.e, key.n)
    return output_int.to_bytes(len(block), 'big', signed=False)


def decrypt_payload(data: bytes) -> bytes:
    if len(data) < 6:
        raise ValueError('Payload too short to contain version and padding')

    version_bytes = data[:4]
    version = None
    if version_bytes == bytes.fromhex('01e10245'):
        version = 1
    elif version_bytes == bytes.fromhex('019b0945'):
        version = 2
    else:
        raise ValueError(f'Unknown payload version: {version_bytes.hex()}')

    if data[4:6] != b'\x00\x00':
        raise ValueError('Expected two zero padding bytes after version')

    blocks = []
    cursor = 6
    for i in range(5):
        blocks.append(data[cursor:cursor + 128])
        cursor += 128
    blocks.append(data[cursor:cursor + 74])

    if any(len(block) != 128 for block in blocks[:5]) or len(blocks[5]) != 74:
        raise ValueError('Payload size does not match expected 714-byte block layout')

    decrypted = bytearray()
    for block in blocks[:5]:
        key = parse_pem_public_key(KEYS[(version, 128)])
        decrypted.extend(decrypt_rsa_block(block, key))
    final_key = parse_pem_public_key(KEYS[(version, 74)])
    decrypted.extend(decrypt_rsa_block(blocks[5], final_key))
    return bytes(decrypted)


def decode_printable_strings(data: bytes, min_length: int = 3) -> List[str]:
    matches = re.findall(rb"[\t\n\r -~]{%d,}" % min_length, data)
    return [m.decode("latin1", errors="replace") for m in matches]



def read_string(data: bytes, index: int) -> Tuple[str, int, Optional[int]]:
    if index >= len(data):
        return '', index, None
    start = index
    while index < len(data) and data[index] not in (0x00, 0xe0, 0xff):
        index += 1
    string = data[start:index].decode('latin1', errors='replace').strip()
    delimiter = data[index] if index < len(data) else None
    return string, index + 1 if index < len(data) else index, delimiter


def read_strings(data: bytes, index: int, count: int) -> Tuple[List[str], int]:
    values = []
    for _ in range(count):
        value, index, _ = read_string(data, index)
        values.append(value)
    return values, index


def parse_decrypted_payload(data: bytes) -> None:
    print('Decrypted byte length:', len(data))
    print('Raw hex prefix:', data[:64].hex())

    index = None
    for idx, b in enumerate(data):
        if b == 0x82:
            index = idx
            break
    if index is None:
        print('Warning: did not find 0x82 section marker. Showing printable strings only.')
    else:
        print(f'Found section marker 0x82 at offset {index}')
        try:
            vehicle_codes, index_after_codes = read_strings(data, index + 2, 4)
            print('Vehicle codes:', vehicle_codes)
            surname, index, delimiter = read_string(data, index_after_codes)
            print('Surname:', surname)
            initials, index, delimiter = read_string(data, index)
            print('Initials:', initials)
            if delimiter == 0xe0:
                prdp, index, delimiter = read_string(data, index)
                print('PrDP Code:', prdp)
            country_id, index, _ = read_string(data, index)
            print('ID Country of Issue:', country_id)
            license_country, index, _ = read_string(data, index)
            print('License Country of Issue:', license_country)
            restrictions, index = read_strings(data, index, 4)
            print('Vehicle Restrictions:', restrictions)
        except Exception as exc:
            print('Parsing section failed:', exc)

    strings = decode_printable_strings(data)
    if strings:
        print('\nPrintable strings found:')
        for value in strings[:25]:
            print('-', value)
    else:
        print('No printable strings found.')


def load_payload(source: str, is_file: bool) -> bytes:
    if is_file:
        with open(source, 'rb') as f:
            raw = f.read()
            if len(raw) >= 720:
                return raw
            return binascii.unhexlify(raw.strip())
    if re.fullmatch(r'[0-9a-fA-F]+', source):
        return binascii.unhexlify(source)
    raise ValueError('If input is not a file, it must be a hex string')


def main() -> None:
    parser = argparse.ArgumentParser(description='Decrypt South African PDF417 license payload using public keys')
    parser.add_argument('--input', '-i', required=True, help='Path to raw payload file or hex string')
    parser.add_argument('--file', '-f', action='store_true', help='Treat input as a binary file path')
    parser.add_argument('--output', '-o', help='Write decrypted bytes to file')
    parser.add_argument('--parse', action='store_true', help='Attempt to parse decrypted payload fields')
    args = parser.parse_args()

    data = load_payload(args.input, args.file)
    decrypted = decrypt_payload(data)

    if args.output:
        with open(args.output, 'wb') as f:
            f.write(decrypted)
        print(f'Decrypted payload written to {args.output}')
    else:
        print('Decrypted payload length:', len(decrypted))

    if args.parse:
        print('\n--- Payload parse ---')
        parse_decrypted_payload(decrypted)
    else:
        print('Run with --parse to attempt structured field extraction')


if __name__ == '__main__':
    main()
