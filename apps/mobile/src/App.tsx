import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { HomeScreen } from './screens/HomeScreen';
import { LoginScreen } from './screens/LoginScreen';
import { OfficerDashboardScreen } from './screens/OfficerDashboardScreen';
import { OfficerReportsScreen } from './screens/OfficerReportsScreen';
import { AuditScreen } from './screens/AuditScreen';
import { AuthProvider } from './lib/AuthContext';
import { SyncProvider } from './lib/SyncContext';
import { getDB } from './db/client';

type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  OfficerDashboard: undefined;
  OfficerReports: undefined;
  Audit: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  useEffect(() => {
    getDB().catch((error) => {
      console.error('Failed to initialize local database:', error);
    });
  }, []);

  return (
    <AuthProvider>
      <SyncProvider>
        <NavigationContainer>
          <Stack.Navigator initialRouteName="Login">
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'IntegriScan' }} />
            <Stack.Screen
              name="OfficerDashboard"
              component={OfficerDashboardScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="OfficerReports"
              component={OfficerReportsScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Audit"
              component={AuditScreen}
              options={{ headerShown: false }}
            />
          </Stack.Navigator>
          <StatusBar style="auto" />
        </NavigationContainer>
      </SyncProvider>
    </AuthProvider>
  );
}