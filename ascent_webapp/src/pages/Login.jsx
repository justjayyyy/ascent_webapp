import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { translations } from '@/components/ThemeProvider';

// Google Client ID - set this in your .env file as VITE_GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Google Calendar scopes - request calendar access during login
const GOOGLE_SCOPES = 'email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events';

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, register, loginWithGoogle } = useAuth();
  
  // Get browser language for login page (before user is authenticated)
  const browserLang = navigator.language?.split('-')[0] || 'en';
  const lang = ['en', 'he', 'ru'].includes(browserLang) ? browserLang : 'en';
  const t = (key) => translations[lang]?.[key] || translations.en?.[key] || key;

  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [registerData, setRegisterData] = useState({ 
    email: '', 
    password: '', 
    confirmPassword: '',
    full_name: '' 
  });

  const redirectUrl = searchParams.get('redirect') || '/Portfolio';

  // Initialize Google Sign-In
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      console.warn('Google Client ID not configured. Set VITE_GOOGLE_CLIENT_ID in .env');
      return;
    }

    // Load Google Identity Services script
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogleSignIn;
    document.body.appendChild(script);

    return () => {
      // Cleanup
      const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, []);

  const initializeGoogleSignIn = () => {
    if (!window.google || !GOOGLE_CLIENT_ID) return;

    // Initialize Google Identity Services for ID token (basic login)
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCallback,
      auto_select: false,
    });

    // Render the Google Sign-In button
    // Note: This button is hidden and not used (we use custom button instead)
    // But we keep it for compatibility - width must be a number, not percentage
    const buttonContainer = document.getElementById('google-signin-button');
    if (buttonContainer) {
      window.google.accounts.id.renderButton(buttonContainer, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        // width must be a number (pixels), not a percentage string
        // Since button is hidden, we use a default width
        text: 'continue_with',
        shape: 'rectangular',
      });
    }
  };

  // Handle Google OAuth with calendar access
  const handleGoogleLoginWithCalendar = () => {
    if (!window.google || !GOOGLE_CLIENT_ID) {
      toast.error('Google Sign-In not available');
      return;
    }

    setIsGoogleLoading(true);

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES,
      callback: async (response) => {
        if (response.access_token) {
          try {
            // Store the calendar access token
            localStorage.setItem('googleCalendarToken', response.access_token);
            localStorage.setItem('googleCalendarTokenExpiry', String(Date.now() + 3600000)); // 1 hour
            
            // Get user info from Google
            const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { 'Authorization': `Bearer ${response.access_token}` }
            });
            const userInfo = await userInfoResponse.json();
            
            // Login with the user info
            await loginWithGoogle(response.access_token, GOOGLE_CLIENT_ID, userInfo);
            toast.success(t('welcomeBack'));
            navigate(redirectUrl);
          } catch (error) {
            console.error('Google login error:', error);
            toast.error(error.message || t('googleSignInFailed'));
          }
        } else if (response.error) {
          console.error('Google OAuth error:', response.error);
          toast.error(t('googleSignInFailed'));
        }
        setIsGoogleLoading(false);
      },
    });

    tokenClient.requestAccessToken();
  };

  const handleGoogleCallback = async (response) => {
    if (!response.credential) {
      toast.error(t('googleSignInFailed'));
      return;
    }

    setIsGoogleLoading(true);

    try {
      await loginWithGoogle(response.credential, GOOGLE_CLIENT_ID);
      toast.success(t('welcomeBack'));
      navigate(redirectUrl);
    } catch (error) {
      toast.error(error.message || t('googleSignInFailed'));
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await login(loginData.email, loginData.password);
      toast.success(t('welcomeBack'));
      navigate(redirectUrl);
    } catch (error) {
      toast.error(error.message || t('loginFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    if (registerData.password !== registerData.confirmPassword) {
      toast.error(t('passwordsDoNotMatch'));
      return;
    }

    if (registerData.password.length < 6) {
      toast.error(t('passwordMinLength'));
      return;
    }

    setIsLoading(true);

    try {
      await register(registerData.email, registerData.password, registerData.full_name);
      toast.success(t('accountCreated'));
      navigate(redirectUrl);
    } catch (error) {
      toast.error(error.message || t('registrationFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#092635] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-[#9EC8B9] mb-2">{t('ascend')}</h1>
          <p className="text-[#5C8374]">{t('ascendTagline')}</p>
        </div>

        <Card className="bg-[#1B4242] border-[#5C8374]/30">
          <CardHeader className="text-center">
            <CardTitle className="text-[#9EC8B9]">{t('welcome')}</CardTitle>
            <CardDescription className="text-[#5C8374]">
              {t('signInToAccount')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Google Sign-In Button with Calendar Access */}
            {GOOGLE_CLIENT_ID && (
              <div className="mb-6">
                <button
                  onClick={handleGoogleLoginWithCalendar}
                  disabled={isGoogleLoading}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg text-gray-700 font-medium transition-colors disabled:opacity-50"
                >
                  {isGoogleLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <img 
                      src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
                      alt="Google" 
                      className="w-5 h-5"
                    />
                  )}
                  {isGoogleLoading ? t('signingIn') : t('continueWithGoogle')}
                </button>
                
                {/* Hidden container for fallback - keep for compatibility */}
                <div 
                  id="google-signin-button" 
                  className="hidden"
                  style={{ minHeight: '44px' }}
                />
                
                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-[#5C8374]/30"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-[#1B4242] text-[#5C8374]">{t('orContinueWithEmail')}</span>
                  </div>
                </div>
              </div>
            )}

            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-[#092635]">
                <TabsTrigger 
                  value="login" 
                  className="data-[state=active]:bg-[#5C8374] data-[state=active]:text-white"
                >
                  {t('login')}
                </TabsTrigger>
                <TabsTrigger 
                  value="register"
                  className="data-[state=active]:bg-[#5C8374] data-[state=active]:text-white"
                >
                  {t('register')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-6">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-[#9EC8B9]">{t('email')}</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@example.com"
                      value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                      required
                      className="bg-[#092635] border-[#5C8374]/50 text-white placeholder:text-[#5C8374]/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password" className="text-[#9EC8B9]">{t('password')}</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={loginData.password}
                        onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                        required
                        className="bg-[#092635] border-[#5C8374]/50 text-white placeholder:text-[#5C8374]/50 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5C8374] hover:text-[#9EC8B9]"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-[#5C8374] hover:bg-[#5C8374]/80 text-white"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t('signingIn')}
                      </>
                    ) : (
                      t('signIn')
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register" className="mt-6">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-name" className="text-[#9EC8B9]">{t('fullName')}</Label>
                    <Input
                      id="register-name"
                      type="text"
                      placeholder="John Doe"
                      value={registerData.full_name}
                      onChange={(e) => setRegisterData({ ...registerData, full_name: e.target.value })}
                      className="bg-[#092635] border-[#5C8374]/50 text-white placeholder:text-[#5C8374]/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-email" className="text-[#9EC8B9]">{t('email')}</Label>
                    <Input
                      id="register-email"
                      type="email"
                      placeholder="you@example.com"
                      value={registerData.email}
                      onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                      required
                      className="bg-[#092635] border-[#5C8374]/50 text-white placeholder:text-[#5C8374]/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-password" className="text-[#9EC8B9]">{t('password')}</Label>
                    <div className="relative">
                      <Input
                        id="register-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={registerData.password}
                        onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                        required
                        minLength={6}
                        className="bg-[#092635] border-[#5C8374]/50 text-white placeholder:text-[#5C8374]/50 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5C8374] hover:text-[#9EC8B9]"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-confirm" className="text-[#9EC8B9]">{t('confirmPassword')}</Label>
                    <Input
                      id="register-confirm"
                      type="password"
                      placeholder="••••••••"
                      value={registerData.confirmPassword}
                      onChange={(e) => setRegisterData({ ...registerData, confirmPassword: e.target.value })}
                      required
                      className="bg-[#092635] border-[#5C8374]/50 text-white placeholder:text-[#5C8374]/50"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-[#5C8374] hover:bg-[#5C8374]/80 text-white"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t('creatingAccount')}
                      </>
                    ) : (
                      t('createAccount')
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
