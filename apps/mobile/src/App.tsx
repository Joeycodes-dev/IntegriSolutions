import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { LoginScreen } from './screens/LoginScreen';
import { OfficerDashboardScreen } from './screens/OfficerDashboardScreen';
import { OfficerReportsScreen } from './screens/OfficerReportsScreen';
import { OfficerShiftsScreen } from './screens/OfficerShiftsScreen';
import { AuditScreen } from './screens/AuditScreen';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { SyncProvider } from './lib/SyncContext';
import { getDB } from './db/client';

type RootStackParamList = {
  Login: undefined;
  OfficerDashboard: undefined;
  OfficerReports: undefined;
  OfficerShifts: undefined;
  Audit: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppNavigator() {
  const { profile, isRestoring } = useAuth();

  if (isRestoring) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {profile ? (
        <>
          <Stack.Screen
            name="OfficerDashboard"
            component={OfficerDashboardScreen}
          />
          <Stack.Screen
            name="OfficerReports"
            component={OfficerReportsScreen}
          />
          <Stack.Screen name="OfficerShifts" component={OfficerShiftsScreen} />
          <Stack.Screen name="Audit" component={AuditScreen} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

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
          <AppNavigator />
          <StatusBar style="auto" />
        </NavigationContainer>
      </SyncProvider>
    </AuthProvider>
  );
}
