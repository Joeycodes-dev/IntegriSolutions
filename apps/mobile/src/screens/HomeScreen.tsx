import { View, Text, Button, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { styles } from './HomeScreen.styles';

type RootStackParamList = {
  Home: undefined;
  OfficerDashboard: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>IntegriScan Mobile</Text>
      <Text style={styles.subtitle}>Officer tools are coming to mobile.</Text>
      <Button title="Open Officer Dashboard" onPress={() => navigation.navigate('OfficerDashboard')} />
    </View>
  );
}