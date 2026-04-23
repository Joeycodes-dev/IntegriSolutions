import React, { createContext, useContext, useState } from 'react';
import type { UserProfile } from '../types';
import { clearAccessToken, setAccessToken } from '../services/auth';

type AuthContextType = {
  profile: UserProfile | null;
  token: string | null;
  signIn: (profile: UserProfile, token: string | null) => void;
  signInLocal: (profile: UserProfile) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const signIn = (profileData: UserProfile, tokenValue: string | null) => {
    setProfile(profileData);
    setToken(tokenValue);
    if (tokenValue) {
      setAccessToken(tokenValue);
    }
  };

  const signInLocal = (profileData: UserProfile) => {
    setProfile(profileData);
    setToken(null);
    clearAccessToken();
  };

  const signOut = () => {
    setProfile(null);
    setToken(null);
    clearAccessToken();
  };

  return (
    <AuthContext.Provider value={{ profile, token, signIn, signInLocal, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
