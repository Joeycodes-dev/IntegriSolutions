import { View, Text, StyleSheet, Pressable } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type RootStackParamList = {
  Home: undefined;
  OfficerDashboard: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'OfficerDashboard'>;

export function OfficerDashboardScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Officer Dashboard</Text>
      <Text style={styles.description}>
        This screen is a starting point for moving officer workflows into the mobile app.
      </Text>
      <Pressable style={styles.button} onPress={() => navigation.goBack()}>
        <Text style={styles.buttonText}>Back to Home</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#312e81',
    marginBottom: 16,
    textAlign: 'center'
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: '#4b5563',
    textAlign: 'center',
    marginBottom: 24
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    backgroundColor: '#4338ca',
    borderRadius: 12
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center'
  }
});
