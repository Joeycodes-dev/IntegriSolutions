import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { uploadChatFiles } from '../services/api';

interface UploadedFile {
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  storageUrl: string;
}

interface Props {
  onFilesSelected: (files: UploadedFile[]) => void;
  disabled?: boolean;
  maxFiles?: number;
}

function guessMimeType(fileName: string, fallback = 'application/octet-stream'): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain'
  };

  return map[ext ?? ''] ?? fallback;
}

function normalizePickedFile(file: { uri: string; name?: string; type?: string | null }): { uri: string; name: string; type: string } {
  const fallbackName = file.name || `attachment-${Date.now()}.bin`;
  const normalizedType = file.type && file.type.trim() ? file.type : guessMimeType(fallbackName);
  return {
    uri: file.uri,
    name: fallbackName,
    type: normalizedType
  };
}

export function ChatAttachmentUpload({ onFilesSelected, disabled, maxFiles = 5 }: Props) {
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<UploadedFile[]>([]);

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled) {
        const normalized = result.assets.map((asset) => normalizePickedFile({
          uri: asset.uri,
          name: asset.fileName || `image-${Date.now()}.jpg`,
          type: asset.mimeType || 'image/jpeg'
        }));
        await uploadFiles(normalized);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick images');
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'],
        copyToCacheDirectory: true,
      });

      const documentResult = result && 'assets' in result && Array.isArray(result.assets) && result.assets.length > 0
        ? result.assets[0]
        : result && 'uri' in result && typeof result.uri === 'string'
          ? { uri: result.uri, name: ('name' in result ? result.name : undefined) as string | undefined, mimeType: ('mimeType' in result ? result.mimeType : undefined) as string | undefined }
          : null;

      if (documentResult) {
        await uploadFiles([normalizePickedFile({
          uri: documentResult.uri,
          name: documentResult.name || `document-${Date.now()}.bin`,
          type: documentResult.mimeType || guessMimeType(documentResult.name || 'document.bin')
        })]);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const handleAddFiles = () => {
    Alert.alert('Add files', 'Choose the type of file to attach.', [
      { text: 'Photos', onPress: () => void handlePickImage() },
      { text: 'Documents', onPress: () => void handlePickDocument() },
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  const uploadFiles = async (files: Array<{ uri: string; name: string; type: string }>) => {
    if (files.length + selectedFiles.length > maxFiles) {
      Alert.alert('Limit', `Maximum ${maxFiles} files allowed`);
      return;
    }

    setUploading(true);
    try {
      const uploadedFiles = await uploadChatFiles(files);
      const newFiles = [...selectedFiles, ...uploadedFiles.files];
      setSelectedFiles(newFiles);
      onFilesSelected(newFiles);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload files';
      Alert.alert('Upload failed', message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    onFilesSelected(newFiles);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TouchableOpacity
          disabled={disabled || uploading || selectedFiles.length >= maxFiles}
          onPress={handleAddFiles}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: '#cbd5e1',
            opacity: disabled || uploading ? 0.5 : 1,
          }}
        >
          <Text style={{ fontSize: 14, color: '#1e293b' }}>
            {uploading ? 'Uploading...' : 'Add files'}
          </Text>
        </TouchableOpacity>
      </View>

      {selectedFiles.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 12 }}
        >
          {selectedFiles.map((file, index) => (
            <View
              key={`${file.fileName}-${index}`}
              style={{
                marginRight: 8,
                padding: 8,
                backgroundColor: '#f1f5f9',
                borderRadius: 6,
                borderWidth: 1,
                borderColor: '#e2e8f0',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: '#1e293b' }} numberOfLines={1}>
                    {file.fileName}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    {formatFileSize(file.fileSize)}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleRemoveFile(index)}>
                  <Text style={{ fontSize: 16, color: '#94a3b8' }}>×</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
