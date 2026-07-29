import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Camera, CameraView, type BarcodeScanningResult } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Feather, MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../lib/AuthContext";
import { generateId } from "../lib/id";
import { saveLocally, syncPendingRecords } from "../services/sync";
import { useSync } from "../lib/SyncContext";
import {
  decryptLicensePayload,
  parseDecryptedLicensePayload,
  type DecryptedLicenseData,
} from "../lib/licenseDecryptor";
import {
  scanDriverLicense,
  type DriverLicenseData,
} from "../services/scanService";
import type { LocalTestRecord } from "../db/repository";
import { OfficerBottomNav } from "../components/OfficerBottomNav";
import { OfficerHome } from "../components/OfficerHome";

import { styles } from "./OfficerDashboardScreen.styles";
import { colors } from "../styles/colors";

type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  OfficerDashboard: undefined;
  OfficerReports: undefined;
  Audit: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, "OfficerDashboard">;

type OfficerStep = "idle" | "scan" | "reading" | "saved";

const DEV_BYPASS_UID_PREFIX = "local-";
const DEV_LICENSE_PAYLOAD =
  "Developer bypass licence payload - camera scan skipped for local testing.";
const DEV_BAC_READING = "0.062";

const DEV_DRIVER_LICENSE: DriverLicenseData = {
  name: "Thabo",
  surname: "Mokoena",
  initials: "T",
  idNumber: "9001015800087",
  licenseNumber: "GP1234567890",
  dob: "1990-01-01",
  expiryDate: "2031-08-31",
  licenseCodes: "B",
};

function isDevBypassProfile(profile: { uid: string } | null): boolean {
  return __DEV__ && !!profile?.uid?.startsWith(DEV_BYPASS_UID_PREFIX);
}

function formatSyncTimestamp(value: Date | null): string {
  const target = value ?? new Date();
  return target.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function getDeviceLocation(): Promise<{ lat: number; lng: number }> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error(
      "Location permission is required to save test GPS coordinates.",
    );
  }

  const current = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const lat = current.coords.latitude;
  const lng = current.coords.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Could not read valid GPS coordinates from this device.");
  }

  return { lat, lng };
}

function getCaptureQualityIssue(
  image: ImagePicker.ImagePickerAsset,
): string | null {
  const width = image.width ?? 0;
  const height = image.height ?? 0;
  const base64Length = image.base64?.length ?? 0;

  if (!image.base64 || base64Length < 120_000) {
    return "Image quality is too low. Hold steady, fill the frame with the licence, and retake.";
  }

  if (width < 1000 || height < 700) {
    return "Photo resolution is too low. Move closer to the licence and retake.";
  }

  return null;
}

function randomBacReading(): string {
  const value = Math.random() * 0.12;
  return value.toFixed(3);
}

function bacStatus(bac: string, limit = 0.05) {
  const awaitingState = {
    label: "AWAITING",
    bgColor: colors.surfaceHighlight,
    textColor: colors.accentBlue,
    borderColor: colors.borderHighlight,
  };

  if (!bac) return awaitingState;

  const reading = parseFloat(bac);
  if (Number.isNaN(reading)) return awaitingState;

  if (reading >= limit)
    return {
      label: "FAIL",
      bgColor: colors.error,
      textColor: colors.background,
      borderColor: colors.error,
    };

  return {
    label: "PASS",
    bgColor: colors.success,
    textColor: colors.background,
    borderColor: colors.success,
  };
}

function normalizeDate(value: string): string | undefined {
  const normalized = value.replace(/\//g, "-").replace(/\s+/g, " ").trim();
  const numeric = normalized.replace(/[^0-9\-]/g, "");

  if (/^\d{8}$/.test(numeric)) {
    const yearFirst = `${numeric.slice(0, 4)}-${numeric.slice(4, 6)}-${numeric.slice(6, 8)}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(yearFirst)) {
      return yearFirst;
    }

    const yearLast = `${numeric.slice(4, 8)}-${numeric.slice(0, 2)}-${numeric.slice(2, 4)}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(yearLast)) {
      return yearLast;
    }
  }

  const match = normalized.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{2}-\d{2}-\d{4}\b/);
  if (!match) return undefined;
  const parts = match[0].split("-");
  if (parts[0].length === 4) {
    return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
  }
  return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
}

function normalizePdf417Payload(rawPayload: string): string {
  return rawPayload
    .replace(/\r/g, "")
    .replace(/\u001d|\u001e|\u001f/g, "\n")
    .replace(/[|;]/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1A\x1C\x7F]/g, " ")
    .trim();
}

function sanitizePayloadForDisplay(rawPayload: string): string {
  return normalizePdf417Payload(rawPayload)
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
}

function formatRawPayloadForDisplay(rawPayload: string): string {
  const sanitized = sanitizePayloadForDisplay(rawPayload);
  const hasBinary = /[\x00-\x1F\x7F-\x9F\uFFFD]/.test(rawPayload);
  const payloadSizeLabel = `Payload length: ${rawPayload.length} bytes`;

  if (!sanitized && rawPayload.length > 0) {
    const hexPreview = Array.from(
      rawPayload,
      (char) =>
        `0x${(char.charCodeAt(0) & 0xff).toString(16).padStart(2, "0")}`,
    )
      .slice(0, 64)
      .join(" ");
    return `${payloadSizeLabel}\n${hexPreview}${rawPayload.length > 64 ? " ..." : ""}`;
  }

  const formatted =
    hasBinary && sanitized
      ? `${sanitized}\n\n[Contains non-printable binary bytes]`
      : sanitized;

  return `${payloadSizeLabel}${formatted ? `\n\n${formatted}` : ""}`.trim();
}

function parseAamvaBarcodeData(rawPayload: string): DriverLicenseData {
  const payload = normalizePdf417Payload(rawPayload);
  const knownTags = [
    "DAA",
    "DAB",
    "DAC",
    "DAD",
    "DAE",
    "DAF",
    "DAG",
    "DAH",
    "DAI",
    "DAJ",
    "DAK",
    "DAL",
    "DAM",
    "DAN",
    "DAO",
    "DAP",
    "DAQ",
    "DAR",
    "DAS",
    "DAT",
    "DAU",
    "DAV",
    "DAW",
    "DAX",
    "DAY",
    "DAZ",
    "DBA",
    "DBB",
    "DBC",
    "DBD",
    "DBE",
    "DBF",
    "DBG",
    "DBH",
    "DBI",
    "DBJ",
    "DBK",
    "DCG",
    "DCH",
    "DCI",
    "DCJ",
    "DCK",
    "DCL",
    "DCM",
    "DCN",
    "DCO",
    "DCP",
    "DCQ",
    "DCR",
    "DCS",
    "DCT",
    "DCU",
    "DCV",
    "DCW",
    "DDA",
    "DDB",
    "DDC",
    "DDD",
    "DDE",
    "DDF",
    "DDG",
    "DDH",
  ];

  const positions: Array<{ tag: string; index: number }> = [];
  for (const tag of knownTags) {
    let index = payload.indexOf(tag);
    while (index !== -1) {
      positions.push({ tag, index });
      index = payload.indexOf(tag, index + tag.length);
    }
  }

  if (positions.length === 0) {
    return parsePdf417BarcodeDataFallback(rawPayload);
  }

  positions.sort((a, b) => a.index - b.index);
  const parsed = new Map<string, string>();

  for (let i = 0; i < positions.length; i += 1) {
    const current = positions[i];
    const start = current.index + current.tag.length;
    const end =
      i + 1 < positions.length ? positions[i + 1].index : payload.length;
    const value = payload
      .slice(start, end)
      .replace(/[\n\r]/g, " ")
      .trim();
    if (value) {
      parsed.set(current.tag, value);
    }
  }

  const rawName = parsed.get("DAA") ?? parsed.get("DCT") ?? "";
  let name = parsed.get("DAC") ?? "";
  let surname = parsed.get("DCS") ?? "";

  if (!name && rawName) {
    const parts = rawName.split(",").map((part) => part.trim());
    if (parts.length >= 2) {
      surname = parts[0];
      name = parts.slice(1).join(" ");
    } else {
      const words = rawName.split(" ").filter(Boolean);
      surname = words.pop() ?? "";
      name = words.join(" ");
    }
  }

  if (!name && !surname) {
    const dee = parsed.get("DCT") ?? parsed.get("DCS");
    if (dee) {
      const words = dee.split(",").map((part) => part.trim());
      if (words.length >= 2) {
        surname = words[0];
        name = words.slice(1).join(" ");
      }
    }
  }

  if (!name) name = "Unknown";
  if (!surname) surname = "Unknown";

  const dob = normalizeDate(parsed.get("DBB") ?? parsed.get("DBD") ?? "");
  const expiryDate = normalizeDate(
    parsed.get("DBA") ?? parsed.get("DBE") ?? "",
  );
  const idNumber = parsed.get("DAQ") ?? parsed.get("IDN") ?? "";
  const licenseNumber = parsed.get("DAQ") ?? parsed.get("DAQ") ?? "";
  const licenseCodes = [parsed.get("DCA"), parsed.get("DCB"), parsed.get("DCD")]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    name,
    surname,
    initials: parsed.get("DAC") ?? parsed.get("DAG") ?? "",
    idNumber,
    licenseNumber,
    dob: dob ?? "",
    expiryDate: expiryDate ?? "",
    licenseCodes,
  };
}

function parsePdf417BarcodeDataFallback(rawPayload: string): DriverLicenseData {
  const normalizedText = rawPayload
    .replace(/\r/g, "\n")
    .replace(/[|;]/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const lines = normalizedText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const nameCandidate = extractLabeledValue(lines, [
    "full name",
    "name",
    "driver name",
    "given names",
    "given name",
  ]);
  const surnameCandidate = extractLabeledValue(lines, ["surname", "last name"]);
  const initialsCandidate = extractLabeledValue(lines, ["initials"]);
  const idCandidate =
    extractLabeledValue(lines, [
      "id number",
      "id no",
      "idnumber",
      "identity number",
      "identity no",
      "identity",
    ]) ?? findPattern(lines, /\b\d{13}\b/);
  const licenseNumberCandidate =
    extractLabeledValue(lines, [
      "license number",
      "licence number",
      "dl number",
      "driver licence number",
      "driver license number",
      "license no",
      "licence no",
    ]) ?? findPattern(lines, /\b[A-Z0-9]{6,12}\b/);
  const dobCandidate = extractLabeledValue(lines, [
    "date of birth",
    "dob",
    "birth date",
  ])
    ? normalizeDate(
        extractLabeledValue(lines, ["date of birth", "dob", "birth date"])!,
      )
    : normalizeDate(
        findPattern(
          lines,
          /\b\d{4}[\/\-]\d{2}[\/\-]\d{2}\b|\b\d{2}[\/\-]\d{2}[\/\-]\d{4}\b/,
        ) ?? "",
      );
  const expiryCandidate = extractLabeledValue(lines, [
    "expiry date",
    "expiry",
    "valid until",
    "valid to",
    "expires",
  ])
    ? normalizeDate(
        extractLabeledValue(lines, [
          "expiry date",
          "expiry",
          "valid until",
          "valid to",
          "expires",
        ])!,
      )
    : normalizeDate(
        findPattern(
          lines,
          /\b\d{4}[\/\-]\d{2}[\/\-]\d{2}\b|\b\d{2}[\/\-]\d{2}[\/\-]\d{4}\b/,
        ) ?? "",
      );
  const codesCandidate = extractLabeledValue(lines, [
    "license codes",
    "license code",
    "license categories",
    "codes",
    "code",
  ]);

  let name = nameCandidate ?? "";
  let surname = surnameCandidate ?? "";
  const initials = initialsCandidate ?? "";

  if (!name && surnameCandidate) {
    const potential = lines.find(
      (line) => /^[A-Za-z ]+$/.test(line) && line.split(" ").length > 1,
    );
    if (potential) {
      name = potential;
    }
  }

  if (!name && !surname && lines.length > 0) {
    const guess = lines[0].replace(/[^A-Za-z ]/g, "").trim();
    if (guess.length > 0) {
      const parts = guess.split(" ").filter(Boolean);
      if (parts.length > 1) {
        surname = parts.pop() ?? "";
        name = parts.join(" ");
      } else {
        name = guess;
      }
    }
  }

  if (!name) {
    name = "Unknown";
  }

  return {
    name,
    surname,
    initials,
    idNumber: idCandidate ?? "",
    licenseNumber: licenseNumberCandidate ?? "",
    dob: dobCandidate ?? "",
    expiryDate: expiryCandidate ?? "",
    licenseCodes: codesCandidate ?? "",
  };
}

function extractLabeledValue(
  lines: string[],
  labels: string[],
): string | undefined {
  const regex = new RegExp(`\\b(?:${labels.join("|")})\\b`, "i");
  const line = lines.find((item) => regex.test(item));
  if (!line) return undefined;
  const parts = line.split(/[:=]/);
  if (parts.length > 1) {
    return parts.slice(1).join(":").trim();
  }
  return line
    .replace(regex, "")
    .replace(/^[\s:-]+/, "")
    .trim();
}

function findPattern(lines: string[], pattern: RegExp): string | undefined {
  const line = lines.find((item) => pattern.test(item));
  return line ? line.match(pattern)?.[0] : undefined;
}

function parsePdf417BarcodeData(rawPayload: string): DriverLicenseData {
  return parseAamvaBarcodeData(rawPayload);
}

function hasUsableLicenseData(data: DriverLicenseData): boolean {
  const name = `${data.name ?? ""} ${data.surname ?? ""}`.trim().toLowerCase();
  const identifier = `${data.licenseNumber || data.idNumber || ""}`.trim();
  return (
    Boolean(identifier) &&
    name.length > 0 &&
    name !== "unknown" &&
    name !== "unknown unknown"
  );
}

function sameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatRecentStopTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const today = new Date();
  if (sameLocalDate(date, today)) {
    return time;
  }

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameLocalDate(date, yesterday)) {
    return `Yesterday ${time}`;
  }

  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

function formatRecentStop(record: LocalTestRecord) {
  return {
    id: record.id,
    time: formatRecentStopTime(record.createdAt),
    name: record.driverName || "Unknown driver",
    license: record.driverId || "No ID recorded",
    bac: record.bacReading.toFixed(3),
    result: record.result === "fail" ? ("FAIL" as const) : ("PASS" as const),
  };
}

function getCaptureQualityIssue(
  image: ImagePicker.ImagePickerAsset,
): string | null {
  const width = image.width ?? 0;
  const height = image.height ?? 0;
  const base64Length = image.base64?.length ?? 0;

  if (!image.base64 || base64Length < 120_000) {
    return "Image quality is too low. Hold steady, fill the frame with the licence, and retake.";
  }

  if (width < 1000 || height < 700) {
    return "Photo resolution is too low. Move closer to the licence and retake.";
  }

  return null;
}

export function OfficerDashboardScreen({ navigation }: Props) {
  const { profile, signOut } = useAuth();
  const {
    pendingCount,
    failedCount,
    syncedCount,
    todayCount,
    weekCount,
    recentTests,
    isSyncing,
    lastSyncedAt,
    forceSync,
    refreshCounts,
  } = useSync();
  const [syncModalVisible, setSyncModalVisible] = useState(false);
  const [step, setStep] = useState<OfficerStep>("idle");
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scannedData, setScannedData] = useState<DriverLicenseData | null>(
    null,
  );
  const [licensePayload, setLicensePayload] = useState<string | null>(null);
  const [decryptedLicenseData, setDecryptedLicenseData] =
    useState<DecryptedLicenseData | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [barcodeScanned, setBarcodeScanned] = useState(false);
  const [bacReading, setBacReading] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [lastSavedTestId, setLastSavedTestId] = useState<string | null>(null);
  const [lastSavedDriver, setLastSavedDriver] =
    useState<DriverLicenseData | null>(null);
  const [isRetest, setIsRetest] = useState(false);
  const [autoWorkflow, setAutoWorkflow] = useState(false);
  const [ocrDebug, setOcrDebug] = useState<DriverLicenseData["_ocr"] | null>(
    null,
  );

  useFocusEffect(
    React.useCallback(() => {
      void refreshCounts();
      return undefined;
    }, [refreshCounts]),
  );

  if (!profile) {
    return null;
  }

  const resetSessionState = () => {
    setHasPermission(null);
    setScannedData(null);
    setLicensePayload(null);
    setDecryptedLicenseData(null);
    setDecryptError(null);
    setBarcodeScanned(false);
    setBacReading("");
    setPhotoUri(null);
    setAutoWorkflow(false);
    setOcrDebug(null);
  };

  if (!profile) {
    return null;
  }

  const startScan = async () => {
    if (isDevBypassProfile(profile)) {
      resetSessionState();
      setHasPermission(true);
      setScannedData(DEV_DRIVER_LICENSE);
      setLicensePayload(DEV_LICENSE_PAYLOAD);
      setBacReading(DEV_BAC_READING);
      setStep("reading");
      return;
    }

    const { status } = await Camera.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera access denied");
      return;
    }

    resetSessionState();
    setHasPermission(true);
    setStep("scan");
  };

  const handleBarcodeScanned = (scanningResult: BarcodeScanningResult) => {
    if (barcodeScanned) return;
    setBarcodeScanned(true);

    const rawPayload = scanningResult.data?.trim();
    if (!rawPayload) {
      Alert.alert(
        "Scan failed",
        "No barcode payload was decoded. Please try again.",
      );
      setStep("idle");
      setBarcodeScanned(false);
      return;
    }

    let decodedLicense: DecryptedLicenseData | null = null;
    try {
      const decryptedBytes = decryptLicensePayload(rawPayload);
      decodedLicense = parseDecryptedLicensePayload(decryptedBytes);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDecryptError(message);
    }

    const data = parsePdf417BarcodeData(rawPayload);
    if (!hasUsableLicenseData(data)) {
      Alert.alert(
        "Scan failed",
        "The licence barcode did not contain readable driver details. Try the front-photo scan.",
      );
      setBarcodeScanned(false);
      return;
    }
    setLicensePayload(formatRawPayloadForDisplay(rawPayload));
    setAutoWorkflow(false);
    setStep("reading");
  };

  const captureFrontOfLicense = async (retryMode = false) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Camera access denied",
        "Please allow camera access to photograph the front of the licence.",
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      base64: true,
      allowsEditing: false,
    });

    const image = result.assets?.[0];
    if (result.canceled || !image) return;

    const qualityIssue = getCaptureQualityIssue(image);
    if (qualityIssue) {
      Alert.alert("Retake required", qualityIssue);
      return;
    }

    setPhotoUri(image.uri);
    setBarcodeScanned(true);
    setLicensePayload(null);
    setDecryptError(null);
    setBacReading("");
    setAutoWorkflow(true);
    try {
      if (!image.base64)
        throw new Error("The camera did not return image data.");
      const data = await scanDriverLicense(image.base64, { retry: retryMode });
      setScannedData(data);
      setOcrDebug(data._ocr ?? null);
      setDecryptedLicenseData(null);
      setStep("reading");
    } catch (error) {
      setBarcodeScanned(false);
      setAutoWorkflow(false);
      const message =
        error instanceof Error ? error.message : "Licence OCR failed.";
      Alert.alert("Licence scan failed", message);
    }
  };

  const retakeFrontOfLicense = async () => {
    setScannedData(null);
    setBacReading("");
    setDecryptError(null);
    await captureFrontOfLicense(true);
  };

  const cancelScan = () => {
    setStep("idle");
    setBarcodeScanned(false);
    setLicensePayload(null);
    setDecryptedLicenseData(null);
    setDecryptError(null);
    setOcrDebug(null);
    setBacReading("");
    setAutoWorkflow(false);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Camera access denied",
        "Please allow camera access to take evidence photos.",
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleRetest = () => {
    if (!lastSavedTestId || !lastSavedDriver) return;

    setScannedData(lastSavedDriver);
    setBacReading("");
    setPhotoUri(null);
    setIsRetest(true);
    setAutoWorkflow(false);
    setOcrDebug(null);
    setStep("reading");
  };

  const handleLogout = async () => {
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
    signOut().catch((error) => {
      console.warn("Sign out warning:", error);
    });
  };

  const handleFinishSession = () => {
    resetSessionState();
    setStep("idle");
    setLastSavedTestId(null);
    setLastSavedDriver(null);
    setIsRetest(false);
    Alert.alert(
      "Record saved",
      "Record saved locally. It will sync when network is available.",
    );
  };

  const persistRecord = async (reading: number) => {
    if (!scannedData || !profile) {
      return;
    }

    if (
      !scannedData.initials.trim() ||
      !scannedData.surname.trim() ||
      !scannedData.expiryDate.trim()
    ) {
      Alert.alert(
        "Licence details required",
        "Could not read initials, surname, and expiry date. Retake the licence photo.",
      );
      return;
    }

    setIsSaving(true);
    try {
      const currentLocation = await getDeviceLocation();
      const isOver = reading >= 0.05;
      const result = reading === 0 ? "pass" : isOver ? "fail" : "pass";
      const id = generateId();

      await saveLocally({
        id,
        officerId: profile.officerId ?? null,
        officerName: profile.name,
        badgeNumber: profile.badgeNumber,
        driverName: `${scannedData.initials} ${scannedData.surname}`.trim(),
        driverId: scannedData.idNumber || scannedData.licenseNumber,
        driverDob: scannedData.dob,
        bacReading: reading,
        result,
        location: currentLocation,
        photoUri,
        originalTestId: isRetest ? lastSavedTestId : null,
      });

      setLastSavedTestId(id);
      setLastSavedDriver(scannedData);
      setIsRetest(false);
      setStep("saved");
      await refreshCounts();

      syncPendingRecords(profile.officerId ?? null).catch(() => {
        // Background sync attempt — errors are non-blocking
      });
    } catch (error) {
      console.error("Save failed:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to save record. Please try again.";
      Alert.alert("Save failed", message);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (
      !autoWorkflow ||
      step !== "reading" ||
      !scannedData ||
      isSaving ||
      bacReading
    ) {
      return;
    }

    if (
      !scannedData.initials.trim() ||
      !scannedData.surname.trim() ||
      !scannedData.expiryDate.trim()
    ) {
      return;
    }

    const simulated = randomBacReading();
    setBacReading(simulated);
    const numeric = Number.parseFloat(simulated);
    if (!Number.isNaN(numeric)) {
      persistRecord(numeric);
    }
  }, [autoWorkflow, step, scannedData, isSaving, bacReading]);

  const saveRecord = async () => {
    if (!scannedData || !bacReading || !profile) {
      return;
    }

    const reading = parseFloat(bacReading);
    if (Number.isNaN(reading)) {
      Alert.alert("Invalid BAC", "Please enter a valid numeric BAC reading.");
      return;
    }

    await persistRecord(reading);
  };

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <View style={styles.iconBadge}>
            <Feather name="shield" size={20} color="#fff" />
          </View>
          <View>
            <Text style={styles.headerLabel}>OFFICER PORTAL</Text>
            <Text style={styles.headerSubtitle}>
              {profile.name} • {profile.badgeNumber}
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.syncBadge}
            onPress={() => setSyncModalVisible(true)}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color="#4338ca" />
            ) : pendingCount > 0 ? (
              <>
                <Feather name="cloud-off" size={14} color="#f59e0b" />
                <Text style={styles.syncBadgeText}>{pendingCount}</Text>
              </>
            ) : (
              <Feather name="check-circle" size={14} color="#22c55e" />
            )}
          </Pressable>
          <Pressable
            style={styles.signOutButton}
            onPress={() => {
              void handleLogout();
            }}
          >
            <Feather name="log-out" size={20} color="#475569" />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        style={styles.contentScroll}
      >
        {step === "idle" && (
          <OfficerHome
            profile={profile}
            pendingCount={pendingCount}
            failedCount={failedCount}
            syncedCount={syncedCount}
            todayCount={todayCount}
            weekCount={weekCount}
            recentStops={recentTests.map(formatRecentStop)}
            isSyncing={isSyncing}
            lastSyncedAt={lastSyncedAt}
            onStartSession={startScan}
            onForceSync={forceSync}
            onOpenReports={() => navigation.navigate("OfficerReports")}
            onOpenAudit={() => navigation.navigate("Audit")}
          />
        )}

        {step === "scan" && hasPermission && (
          <View style={styles.cameraContainer}>
            <CameraView
              style={styles.camera}
              facing="back"
              ratio="16:9"
              barcodeScannerSettings={{ barcodeTypes: ["pdf417"] }}
              onBarcodeScanned={handleBarcodeScanned}
            />
            <View style={styles.scanOverlay} />
            <View style={styles.scanInstructions}>
              <Text style={styles.scanHint}>
                {barcodeScanned
                  ? "Reading barcode..."
                  : "Point the PDF417 barcode inside the frame."}
              </Text>
            </View>
            <View style={styles.scanActions}>
              <Pressable
                style={styles.primaryButton}
                onPress={() => {
                  void captureFrontOfLicense(false);
                }}
              >
                <Feather name="camera" size={17} color="#fff" />
                <Text style={styles.primaryButtonText}>
                  Photograph Front of Licence
                </Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={cancelScan}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}

        {step === "reading" && (
          <View style={styles.card}>
            <View style={styles.profileSummary}>
              <View style={styles.profileIcon}>
                <MaterialCommunityIcons
                  name="account"
                  size={24}
                  color="#94a3b8"
                />
              </View>
              <View>
                <Text style={styles.overline}>Subject Identified</Text>
                <Text style={styles.subjectName}>
                  {scannedData?.name} {scannedData?.surname}
                </Text>
                <Text style={styles.subjectLicense}>
                  ID: {scannedData?.idNumber}
                </Text>
                <Text style={styles.subjectLicense}>
                  License: {scannedData?.licenseNumber || "Not detected"}
                </Text>
              </View>
            </View>

            <View style={styles.confirmationCard}>
              <Text style={styles.overline}>Captured Licence Fields</Text>
              <Text style={styles.confirmationHint}>
                Read-only fields populated from the front-licence image.
              </Text>
              {[
                ["Initials", scannedData?.initials],
                ["Surname", scannedData?.surname],
                ["ID No", scannedData?.idNumber],
                ["Licence Number", scannedData?.licenseNumber],
                ["Expiry Date", scannedData?.expiryDate],
              ].map(([label, value]) => (
                <View key={label} style={styles.licenseField}>
                  <Text style={styles.licenseFieldLabel}>{label}</Text>
                  <View style={styles.licenseFieldInput}>
                    <Text style={styles.licenseFieldValue}>
                      {value || "Not detected"}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {decryptedLicenseData ? (
              <View style={styles.decryptedCard}>
                <Text style={styles.overline}>Decrypted license payload</Text>
                <Text style={styles.decryptedRow}>
                  Surname: {decryptedLicenseData.surname || "Unknown"}
                </Text>
                <Text style={styles.decryptedRow}>
                  Initials: {decryptedLicenseData.initials || "Unknown"}
                </Text>
                {decryptedLicenseData.prdpCode ? (
                  <Text style={styles.decryptedRow}>
                    PrDP Code: {decryptedLicenseData.prdpCode}
                  </Text>
                ) : null}
                <Text style={styles.decryptedRow}>
                  Vehicle codes:{" "}
                  {decryptedLicenseData.vehicleCodes
                    .filter(Boolean)
                    .join(", ") || "N/A"}
                </Text>
                <Text style={styles.decryptedRow}>
                  License country:{" "}
                  {decryptedLicenseData.licenseCountryOfIssue || "N/A"}
                </Text>
                <Text style={styles.decryptedRow}>
                  Restrictions:{" "}
                  {decryptedLicenseData.vehicleRestrictions
                    .filter(Boolean)
                    .join(", ") || "N/A"}
                </Text>
              </View>
            ) : null}
            {decryptedLicenseData?.printableStrings?.length ? (
              <View style={styles.decryptedPreviewCard}>
                <Text style={styles.overline}>Decrypted payload preview</Text>
                {decryptedLicenseData.printableStrings
                  .slice(0, 5)
                  .map((item, index) => (
                    <Text
                      key={index}
                      style={styles.decryptedPreviewText}
                      numberOfLines={2}
                      ellipsizeMode="tail"
                    >
                      • {item}
                    </Text>
                  ))}
                {decryptedLicenseData.printableStrings.length > 5 ? (
                  <Text style={styles.decryptedPreviewHint}>
                    Showing first 5 parsed strings.
                  </Text>
                ) : null}
              </View>
            ) : null}
            {decryptError ? (
              <View style={styles.decryptErrorCard}>
                <Text style={styles.decryptErrorLabel}>Decrypt error</Text>
                <Text style={styles.decryptErrorText}>{decryptError}</Text>
              </View>
            ) : null}
            {licensePayload ? (
              <View style={styles.rawPayloadCard}>
                <Text style={styles.overline}>Raw barcode payload</Text>
                <Text style={styles.rawPayloadText}>{licensePayload}</Text>
              </View>
            ) : null}

            <View style={styles.bacSection}>
              <Text style={styles.overline}>
                BAC Reading Simulator (g/100ml)
              </Text>
              <View
                style={[
                  styles.bacInput,
                  bacStatus(bacReading).label !== "AWAITING" && {
                    backgroundColor: bacStatus(bacReading).bgColor,
                    borderColor: bacStatus(bacReading).borderColor,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.bacValueText,
                    bacStatus(bacReading).label !== "AWAITING" && {
                      color: bacStatus(bacReading).textColor,
                    },
                  ]}
                >
                  {bacReading || "Awaiting reading"}
                </Text>
              </View>
              <Text style={styles.bacSuffix}>BAC</Text>
              <Text style={styles.readOnlyHint}>
                Reading is captured from the configured testing flow and cannot
                be edited manually.
              </Text>
            </View>

            {autoWorkflow && (
              <View style={styles.autoBanner}>
                {isSaving ? (
                  <ActivityIndicator size="small" color="#4338ca" />
                ) : (
                  <Feather name="check-circle" size={16} color="#16a34a" />
                )}
                <Text style={styles.autoBannerText}>
                  {isSaving
                    ? "Auto-saving and syncing record..."
                    : "BAC simulated and record queued for sync automatically."}
                </Text>
              </View>
            )}

            {autoWorkflow && ocrDebug && (
              <View style={styles.ocrDebugCard}>
                <Text style={styles.overline}>OCR Debug</Text>
                <Text style={styles.ocrDebugText}>
                  Overall confidence:{" "}
                  {(ocrDebug.overallConfidence * 100).toFixed(0)}%
                </Text>
                <Text style={styles.ocrDebugText}>
                  Fallback used: {ocrDebug.usedPaidFallback ? "Yes" : "No"}
                </Text>
                {ocrDebug.fallbackReason ? (
                  <Text style={styles.ocrDebugText}>
                    Reason: {ocrDebug.fallbackReason}
                  </Text>
                ) : null}
              </View>
            )}

            {autoWorkflow &&
              !isSaving &&
              (!scannedData?.initials?.trim() ||
                !scannedData?.surname?.trim() ||
                !scannedData?.expiryDate?.trim()) && (
                <View style={styles.actionRow}>
                  <Pressable
                    style={styles.primaryButton}
                    onPress={retakeFrontOfLicense}
                  >
                    <Feather name="camera" size={18} color={colors.background} />
                    <Text style={styles.primaryButtonText}>
                      Retake Front Licence Photo
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => setStep("scan")}>
                    <Text style={styles.abortText}>Back To Scanner</Text>
                  </Pressable>
                </View>
              )}

            <View style={styles.statusRow}>
              <View style={styles.statusCard}>
                <Text style={styles.statusLabel}>Legal Limit</Text>
                <Text style={styles.statusValue}>{bacLimit.toFixed(3)}</Text>
              </View>
              <View
                style={[
                  styles.statusCardAlt,
                  {
                    backgroundColor: bacStatus(bacReading, bacLimit).bgColor,
                    borderColor: bacStatus(bacReading, bacLimit).borderColor,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusLabelAlt,
                    { color: bacStatus(bacReading, bacLimit).textColor },
                  ]}
                >
                  Status
                </Text>
                <Text
                  style={[
                    styles.statusValueAlt,
                    { color: bacStatus(bacReading, bacLimit).textColor },
                  ]}
                >
                  {bacStatus(bacReading, bacLimit).label}
                </Text>
              </View>
            </View>

            <View style={styles.evidenceSection}>
              <Text style={styles.overline}>Evidence Photo (optional)</Text>
              {photoUri ? (
                <View style={styles.photoPreview}>
                  <Image source={{ uri: photoUri }} style={styles.photoImage} />
                  <Pressable
                    style={styles.photoRemove}
                    onPress={() => setPhotoUri(null)}
                  >
                    <Feather name="x" size={14} color={colors.background} />
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.photoButton} onPress={takePhoto}>
                  <Feather name="camera" size={18} color={colors.background} />
                  <Text style={styles.photoButtonText}>TAKE PHOTO</Text>
                </Pressable>
              )}
            </View>

            {!autoWorkflow && (
              <View style={styles.actionRow}>
                <Pressable
                  style={[
                    styles.primaryButton,
                    (!bacReading || isSaving) && styles.buttonDisabled,
                  ]}
                  onPress={saveRecord}
                  disabled={!bacReading || isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      <Feather name="shield" size={18} color="#fff" /> COMMIT TO
                      LEDGER
                    </Text>
                  )}
                </Pressable>
                <Pressable onPress={() => setStep("idle")}>
                  <Text style={styles.abortText}>Abort Session</Text>
                </Pressable>
              </View>
            )}

            {isRetest && (
              <View style={styles.actionRow}>
                <Pressable onPress={handleFinishSession}>
                  <Text style={styles.abortText}>Back to Main Menu</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {step === "saved" && (
          <View style={styles.card}>
            <View style={styles.savedIcon}>
              <Feather name="check-circle" size={48} color={colors.success} />
            </View>
            <Text style={styles.savedTitle}>Record Saved</Text>
            <Text style={styles.savedSubtitle}>
              Test record has been committed to the ledger and will sync when
              network is available.
            </Text>

            {lastSavedDriver && (
              <View style={styles.savedDriverCard}>
                <Text style={styles.overline}>Driver</Text>
                <Text style={styles.savedDriverName}>
                  {lastSavedDriver.name} {lastSavedDriver.surname}
                </Text>
                <Text style={styles.savedDriverId}>
                  ID:{" "}
                  {lastSavedDriver.idNumber || lastSavedDriver.licenseNumber}
                </Text>
              </View>
            )}

            <View style={styles.actionRow}>
              <Pressable
                style={styles.secondaryActionButton}
                onPress={handleRetest}
              >
                <Feather name="refresh-cw" size={18} color={colors.primaryDark} />
                <Text style={styles.secondaryActionText}>RETEST DRIVER</Text>
              </Pressable>
              <Pressable
                style={styles.primaryButton}
                onPress={handleFinishSession}
              >
                <Text style={styles.primaryButtonText}>FINISH SESSION</Text>
              </Pressable>
            </View>
          </View>
        )}

        {step === "saved" && (
          <View style={styles.card}>
            <View style={styles.savedIcon}>
              <Feather name="check-circle" size={48} color={colors.success} />
            </View>
            <Text style={styles.savedTitle}>Record Saved</Text>
            <Text style={styles.savedSubtitle}>
              Test record has been committed to the ledger and will sync when
              network is available.
            </Text>

            {lastSavedDriver && (
              <View style={styles.savedDriverCard}>
                <Text style={styles.overline}>Driver</Text>
                <Text style={styles.savedDriverName}>
                  {lastSavedDriver.name} {lastSavedDriver.surname}
                </Text>
                <Text style={[styles.savedDriverId]}>
                  ID:{" "}
                  {lastSavedDriver.licenseNumber || lastSavedDriver.idNumber}
                </Text>
              </View>
            )}

            <View style={styles.actionRow}>
              <Pressable
                style={styles.secondaryActionButton}
                onPress={handleRetest}
              >
                <Feather
                  name="refresh-cw"
                  size={18}
                  color={colors.primaryDark}
                />
                <Text style={styles.secondaryActionText}>RETEST DRIVER</Text>
              </Pressable>
              <Pressable
                style={styles.primaryButton}
                onPress={handleFinishSession}
              >
                <Text style={styles.primaryButtonText}>FINISH SESSION</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      <OfficerBottomNav active="OfficerDashboard" />

      <Modal
        visible={syncModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSyncModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSyncModalVisible(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sync Status</Text>
              <Pressable onPress={() => setSyncModalVisible(false)}>
                <Feather name="x" size={20} color="#64748b" />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.modalRow}>
                <View
                  style={[styles.modalDot, { backgroundColor: "#22c55e" }]}
                />
                <Text style={styles.modalLabel}>Synced</Text>
                <Text style={styles.modalValue}>{syncedCount}</Text>
              </View>

              <View style={styles.modalRow}>
                <View
                  style={[styles.modalDot, { backgroundColor: "#f59e0b" }]}
                />
                <Text style={styles.modalLabel}>Pending Sync</Text>
                <Text style={styles.modalValue}>{pendingCount}</Text>
              </View>

              <View style={styles.modalRow}>
                <View
                  style={[styles.modalDot, { backgroundColor: "#ef4444" }]}
                />
                <Text style={styles.modalLabel}>Failed</Text>
                <Text style={styles.modalValue}>{failedCount}</Text>
              </View>
            </View>

            <View style={styles.modalFooter}>
              <Feather name="clock" size={12} color="#94a3b8" />
              <Text style={styles.modalFooterText}>
                Last sync: {formatSyncTimestamp(lastSyncedAt)}
              </Text>
            </View>

            <Pressable
              style={[
                styles.modalSyncButton,
                isSyncing && styles.buttonDisabled,
              ]}
              onPress={async () => {
                await forceSync();
                setSyncModalVisible(false);
              }}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="refresh-cw" size={16} color="#fff" />
                  <Text style={styles.modalSyncButtonText}>Force Sync</Text>
                </>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
