import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, Linking } from 'react-native';
import { markAttachmentOpened } from '../services/api';
import type { ChatAttachment } from '../types';

interface Props {
  attachments: ChatAttachment[];
  onAttachmentOpen?: (attachmentId: number) => void;
}

export function ChatAttachmentsDisplay({ attachments, onAttachmentOpen }: Props) {
  const isImage = (fileType: string): boolean => {
    return fileType.startsWith('image/');
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (fileType: string): string => {
    if (fileType.startsWith('image/')) return '🖼️';
    if (fileType === 'application/pdf') return '📄';
    if (fileType.includes('word')) return '📝';
    if (fileType.includes('sheet')) return '📊';
    if (fileType.includes('presentation')) return '📽️';
    if (fileType === 'text/plain') return '📃';
    return '📎';
  };

  const handleAttachmentClick = async (attachment: ChatAttachment) => {
    try {
      await markAttachmentOpened(attachment.id);
      onAttachmentOpen?.(attachment.id);
      await Linking.openURL(attachment.storageUrl);
    } catch (err) {
      console.error('Failed to open attachment:', err);
    }
  };

  if (attachments.length === 0) return null;

  return (
    <View style={{ marginTop: 8, gap: 8 }}>
      {attachments.map((attachment) => (
        <TouchableOpacity
          key={attachment.id}
          onPress={() => void handleAttachmentClick(attachment)}
          activeOpacity={0.7}
          style={{
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            overflow: 'hidden',
          }}
        >
          {isImage(attachment.fileType) ? (
            <Image
              source={{ uri: attachment.storageUrl }}
              style={{ width: '100%', height: 200, backgroundColor: '#f1f5f9' }}
            />
          ) : (
            <View style={{ padding: 12, backgroundColor: '#f8fafc' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 32 }}>{getFileIcon(attachment.fileType)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: '#1e293b' }} numberOfLines={2}>
                    {attachment.fileName}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    {formatFileSize(attachment.fileSize)}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {attachment.openedCount > 0 && (
            <View style={{ padding: 12, backgroundColor: '#eff6ff', borderTopWidth: 1, borderTopColor: '#e2e8f0' }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#0369a1' }}>
                👁️ {attachment.openedCount === 1 ? '1 person viewed' : `${attachment.openedCount} people viewed`}
              </Text>
              {attachment.openedBy.length > 0 && (
                <View style={{ marginTop: 8, gap: 4 }}>
                  {attachment.openedBy.slice(0, 3).map((viewer, idx) => (
                    <Text key={idx} style={{ fontSize: 11, color: '#475569' }}>
                      {viewer.name}
                      {viewer.badgeNumber && <Text> ({viewer.badgeNumber})</Text>}
                      {' '}
                      <Text style={{ color: '#94a3b8', fontSize: 10 }}>
                        {new Date(viewer.openedAt).toLocaleTimeString()}
                      </Text>
                    </Text>
                  ))}
                  {attachment.openedBy.length > 3 && (
                    <Text style={{ fontSize: 11, color: '#475569' }}>
                      +{attachment.openedBy.length - 3} more
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}
