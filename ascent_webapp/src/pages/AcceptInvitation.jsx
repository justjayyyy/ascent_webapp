import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Mail, User, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { ascent } from '@/api/client';

// Google Client ID
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function AcceptInvitation() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    // Load Google Identity Services script
    if (GOOGLE_CLIENT_ID) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initializeGoogleSignIn;
      document.body.appendChild(script);

      return () => {
        const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
        if (existingScript) {
          existingScript.remove();
        }
      };
    }
  }, [invitation]); // Re-initialize when invitation loads

  useEffect(() => {
    fetchInvitation();
  }, [token]);

  const fetchInvitation = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/invitations/${token}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to load invitation');
      }

      setInvitation(data);
    } catch (error) {
      console.error('Error fetching invitation:', error);
      toast.error(error.message || 'Invalid or expired invitation');
      setTimeout(() => navigate('/login'), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const initializeGoogleSignIn = () => {
    if (!window.google || !GOOGLE_CLIENT_ID || !invitation) return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCallback,
      auto_select: false,
    });

    // Render the Google Sign-In button - wait a bit for DOM to be ready
    setTimeout(() => {
      const buttonContainer = document.getElementById('google-signin-button');
      if (buttonContainer && window.google?.accounts?.id) {
        // Clear any existing content
        buttonContainer.innerHTML = '';
        window.google.accounts.id.renderButton(buttonContainer, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
        });
      }
    }, 100);
  };

  const handleGoogleCallback = async (response) => {
    if (!response.credential) {
      setIsSigningIn(false);
      return;
    }

    setIsSigningIn(true);

    try {
      // Verify the email matches the invitation
      const tokenResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${response.credential}`);
      const tokenData = await tokenResponse.json();
      
      if (!tokenData.email || tokenData.email.toLowerCase() !== invitation.invitedEmail.toLowerCase()) {
        throw new Error(`You must sign in with ${invitation.invitedEmail} to accept this invitation`);
      }
      
      // Login with Google (invitation will be auto-accepted on backend)
      const loginResponse = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential: response.credential,
          clientId: GOOGLE_CLIENT_ID
        })
      });

      const loginData = await loginResponse.json();

      if (!loginResponse.ok) {
        throw new Error(loginData.message || 'Login failed');
      }

      // Store token
      localStorage.setItem('ascent_access_token', loginData.token);

      toast.success('Welcome! Your invitation has been accepted.');
      navigate('/Portfolio');
    } catch (error) {
      console.error('Google login error:', error);
      toast.error(error.message || 'Failed to sign in');
    } finally {
      setIsSigningIn(false);
    }
  };


  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#092635] flex items-center justify-center p-4">
        <Card className="bg-[#1B4242] border-[#5C8374]/30 max-w-md w-full">
          <CardContent className="p-6 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#5C8374] mx-auto mb-4" />
            <p className="text-[#9EC8B9]">Loading invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!invitation) {
    return null;
  }

  const permissionsList = [];
  if (invitation?.permissions?.viewPortfolio) permissionsList.push('View Portfolio');
  if (invitation?.permissions?.editPortfolio) permissionsList.push('Edit Portfolio');
  if (invitation?.permissions?.viewExpenses) permissionsList.push('View Expenses');
  if (invitation?.permissions?.editExpenses) permissionsList.push('Edit Expenses');
  if (invitation?.permissions?.viewNotes) permissionsList.push('View Notes');
  if (invitation?.permissions?.editNotes) permissionsList.push('Edit Notes');
  if (invitation?.permissions?.viewGoals) permissionsList.push('View Goals');
  if (invitation?.permissions?.editGoals) permissionsList.push('Edit Goals');
  if (invitation?.permissions?.viewBudgets) permissionsList.push('View Budgets');
  if (invitation?.permissions?.editBudgets) permissionsList.push('Edit Budgets');
  if (invitation?.permissions?.viewSettings) permissionsList.push('View Settings');
  if (invitation?.permissions?.manageUsers) permissionsList.push('Manage Users');

  return (
    <div className="min-h-screen bg-[#092635] flex items-center justify-center p-4">
      <Card className="bg-[#1B4242] border-[#5C8374]/30 max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <Shield className="w-12 h-12 text-[#5C8374]" />
          </div>
          <CardTitle className="text-2xl font-bold text-[#9EC8B9]">
            You've Been Invited!
          </CardTitle>
          <CardDescription className="text-[#5C8374] mt-2">
            Sign in with Google to accept this invitation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-[#092635] rounded-lg">
              <Mail className="w-5 h-5 text-[#5C8374]" />
              <div>
                <p className="text-xs text-[#5C8374]">Invited Email</p>
                <p className="text-sm font-medium text-[#9EC8B9]">{invitation.invitedEmail}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-[#092635] rounded-lg">
              <User className="w-5 h-5 text-[#5C8374]" />
              <div>
                <p className="text-xs text-[#5C8374]">Display Name</p>
                <p className="text-sm font-medium text-[#9EC8B9]">{invitation.displayName}</p>
              </div>
            </div>
          </div>

          {permissionsList.length > 0 && (
            <div className="p-4 bg-[#092635] rounded-lg">
              <p className="text-sm font-medium text-[#9EC8B9] mb-2">Your Permissions:</p>
              <ul className="space-y-1">
                {permissionsList.map((perm, idx) => (
                  <li key={idx} className="text-xs text-[#5C8374]">• {perm}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-4">
            {/* Google Sign-In Button Container - visible and ready */}
            <div 
              id="google-signin-button" 
              className="w-full flex justify-center"
              style={{ minHeight: '44px' }}
            />
            {isSigningIn && (
              <div className="mt-3 text-center">
                <Loader2 className="w-4 h-4 animate-spin text-[#5C8374] mx-auto mb-2" />
                <p className="text-xs text-[#5C8374]">Signing in...</p>
              </div>
            )}
            <p className="text-xs text-[#5C8374] text-center mt-3">
              You must sign in with <strong>{invitation.invitedEmail}</strong> to accept this invitation
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
