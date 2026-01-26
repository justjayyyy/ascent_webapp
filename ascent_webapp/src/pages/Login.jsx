import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
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

  // Get redirect URL, but exclude public pages (terms-of-service, privacy-policy, login)
  const rawRedirectUrl = searchParams.get('redirect') || '/Portfolio';
  const publicPages = ['/terms-of-service', '/privacy-policy', '/login'];
  const redirectUrl = publicPages.includes(rawRedirectUrl) ? '/Portfolio' : rawRedirectUrl;

  // Prevent body scrolling on mobile
  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyHeight = document.body.style.height;
    const originalHtmlHeight = document.documentElement.style.height;
    
    document.body.style.overflow = 'hidden';
    document.body.style.height = '100dvh';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.height = '100dvh';
    
    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.height = originalBodyHeight;
      document.body.style.position = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.documentElement.style.height = originalHtmlHeight;
    };
  }, []);

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
          
          // Provide more specific error messages
          if (response.error === 'access_denied') {
            toast.error('Access denied. Please grant permissions to sign in with Google.');
          } else if (response.error === 'popup_closed_by_user') {
            toast.error('Sign-in cancelled. Please try again.');
          } else {
            // Fallback: Try using the simpler ID token flow without calendar scopes
            console.log('OAuth2 flow failed, falling back to ID token flow');
            setIsGoogleLoading(false);
            // Trigger the ID token flow instead
            if (window.google?.accounts?.id) {
              window.google.accounts.id.prompt((notification) => {
                if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                  // User has already signed in or dismissed the prompt
                  // Try to render the button programmatically
                  const buttonContainer = document.getElementById('google-signin-button');
                  if (buttonContainer) {
                    const button = buttonContainer.querySelector('div[role="button"]');
                    if (button) {
                      button.click();
                    }
                  }
                }
              });
            } else {
              toast.error(t('googleSignInFailed') + ': ' + response.error);
            }
            return;
          }
        }
        setIsGoogleLoading(false);
      },
    });

    // Request access token with prompt to ensure consent screen shows
    tokenClient.requestAccessToken({ prompt: '' });
  };

  const handleGoogleCallback = async (response) => {
    if (!response.credential) {
      setIsGoogleLoading(false);
      if (response.select_by === 'user') {
        // User clicked but no credential - might be an error
        toast.error('Sign-in cancelled or failed. Please try again.');
      }
      return;
    }

    setIsGoogleLoading(true);

    try {
      await loginWithGoogle(response.credential, GOOGLE_CLIENT_ID);
      toast.success(t('welcomeBack'));
      navigate(redirectUrl);
    } catch (error) {
      console.error('Google login error:', error);
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
    <div className="bg-[#092635] flex items-center justify-center p-2 sm:p-4 overflow-hidden" style={{ height: '100dvh', minHeight: '100vh', maxHeight: '100dvh', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      <div className="w-full max-w-md flex flex-col items-center justify-center max-h-full overflow-hidden pt-2 sm:pt-0 pb-2">
        {/* Logo */}
        <div className="text-center mb-2 sm:mb-8 flex-shrink-0">
          <img 
            src="/logo-dark.png"
            alt="Ascend Logo" 
            className="object-contain mx-auto mb-1 sm:mb-3 h-[70px] sm:h-[120px] w-auto"
            style={{ filter: 'brightness(1.1) saturate(1.2)' }}
          />
          <h1 className="text-2xl sm:text-4xl font-bold text-[#9EC8B9] mb-1 sm:mb-2">{t('ascend')}</h1>
          <p className="text-xs sm:text-base text-[#5C8374]">{t('ascendTagline')}</p>
        </div>

        <Card className="bg-[#1B4242] border-[#5C8374]/30 mb-2 sm:mb-0 flex-shrink-0 w-full">
          <CardHeader className="text-center pb-2 sm:pb-6">
            <CardTitle className="text-base sm:text-xl text-[#9EC8B9]">{t('welcome')}</CardTitle>
            <CardDescription className="text-xs sm:text-sm text-[#5C8374]">
              {t('signInToAccount')}
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-3 sm:pb-6 px-3 sm:px-6">
            {/* Google Sign-In Button - Using ID token flow (simpler, no calendar scopes required) */}
            {GOOGLE_CLIENT_ID && (
              <div className="mb-2 sm:mb-6">
                <button
                  onClick={() => {
                    // Use the simpler ID token flow for login (no calendar scopes)
                    // Calendar access will be requested separately when user accesses calendar feature
                    setIsGoogleLoading(true);
                    const buttonContainer = document.getElementById('google-signin-button');
                    if (buttonContainer) {
                      const googleButton = buttonContainer.querySelector('div[role="button"]');
                      if (googleButton) {
                        // Click the hidden Google button to trigger ID token flow
                        (googleButton as HTMLElement).click();
                      } else {
                        setIsGoogleLoading(false);
                        toast.error('Google Sign-In not ready. Please wait a moment and try again.');
                      }
                    } else {
                      setIsGoogleLoading(false);
                      toast.error('Google Sign-In not available');
                    }
                  }}
                  disabled={isGoogleLoading}
                  className="w-full flex items-center justify-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg text-xs sm:text-base text-gray-700 font-medium transition-colors disabled:opacity-50"
                >
                  {isGoogleLoading ? (
                    <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                  ) : (
                    <img 
                      src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
                      alt="Google" 
                      className="w-4 h-4 sm:w-5 sm:h-5"
                    />
                  )}
                  {isGoogleLoading ? t('signingIn') : t('continueWithGoogle')}
                </button>
                
                {/* Hidden Google Sign-In Button - used to trigger ID token flow */}
                <div 
                  id="google-signin-button" 
                  className="hidden"
                  style={{ minHeight: '44px' }}
                />
                
                {/* Divider */}
                <div className="relative my-2 sm:my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-[#5C8374]/30"></div>
                  </div>
                  <div className="relative flex justify-center text-xs sm:text-sm">
                    <span className="px-2 bg-[#1B4242] text-[#5C8374]">{t('orContinueWithEmail')}</span>
                  </div>
                </div>
              </div>
            )}

            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-[#092635] h-9 sm:h-10">
                <TabsTrigger 
                  value="login" 
                  className="text-xs sm:text-sm data-[state=active]:bg-[#5C8374] data-[state=active]:text-white"
                >
                  {t('login')}
                </TabsTrigger>
                <TabsTrigger 
                  value="register"
                  className="text-xs sm:text-sm data-[state=active]:bg-[#5C8374] data-[state=active]:text-white"
                >
                  {t('register')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-2 sm:mt-6">
                <form onSubmit={handleLogin} className="space-y-2 sm:space-y-4">
                  <div className="space-y-1 sm:space-y-2">
                    <Label htmlFor="login-email" className="text-xs sm:text-sm text-[#9EC8B9]">{t('email')}</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@example.com"
                      value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                      required
                      className="h-9 sm:h-10 text-sm bg-[#092635] border-[#5C8374]/50 text-white placeholder:text-[#5C8374]/50"
                    />
                  </div>
                  <div className="space-y-1 sm:space-y-2">
                    <Label htmlFor="login-password" className="text-xs sm:text-sm text-[#9EC8B9]">{t('password')}</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={loginData.password}
                        onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                        required
                        className="h-9 sm:h-10 text-sm bg-[#092635] border-[#5C8374]/50 text-white placeholder:text-[#5C8374]/50 pr-9 sm:pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-[#5C8374] hover:text-[#9EC8B9]"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full h-9 sm:h-10 text-sm sm:text-base bg-[#5C8374] hover:bg-[#5C8374]/80 text-white"
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

              <TabsContent value="register" className="mt-2 sm:mt-6">
                <form onSubmit={handleRegister} className="space-y-2 sm:space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                    <div className="space-y-1 sm:space-y-2">
                      <Label htmlFor="register-name" className="text-xs sm:text-sm text-[#9EC8B9]">{t('fullName')}</Label>
                      <Input
                        id="register-name"
                        type="text"
                        placeholder="John Doe"
                        value={registerData.full_name}
                        onChange={(e) => setRegisterData({ ...registerData, full_name: e.target.value })}
                        className="h-9 sm:h-10 text-sm bg-[#092635] border-[#5C8374]/50 text-white placeholder:text-[#5C8374]/50"
                      />
                    </div>
                    <div className="space-y-1 sm:space-y-2">
                      <Label htmlFor="register-email" className="text-xs sm:text-sm text-[#9EC8B9]">{t('email')}</Label>
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="you@example.com"
                        value={registerData.email}
                        onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                        required
                        className="h-9 sm:h-10 text-sm bg-[#092635] border-[#5C8374]/50 text-white placeholder:text-[#5C8374]/50"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                    <div className="space-y-1 sm:space-y-2">
                      <Label htmlFor="register-password" className="text-xs sm:text-sm text-[#9EC8B9]">{t('password')}</Label>
                      <div className="relative">
                        <Input
                          id="register-password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={registerData.password}
                          onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                          required
                          minLength={6}
                          className="h-9 sm:h-10 text-sm bg-[#092635] border-[#5C8374]/50 text-white placeholder:text-[#5C8374]/50 pr-9 sm:pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-[#5C8374] hover:text-[#9EC8B9]"
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1 sm:space-y-2">
                      <Label htmlFor="register-confirm" className="text-xs sm:text-sm text-[#9EC8B9]">{t('confirmPassword')}</Label>
                      <Input
                        id="register-confirm"
                        type="password"
                        placeholder="••••••••"
                        value={registerData.confirmPassword}
                        onChange={(e) => setRegisterData({ ...registerData, confirmPassword: e.target.value })}
                        required
                        className="h-9 sm:h-10 text-sm bg-[#092635] border-[#5C8374]/50 text-white placeholder:text-[#5C8374]/50"
                      />
                    </div>
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full h-9 sm:h-10 text-sm sm:text-base bg-[#5C8374] hover:bg-[#5C8374]/80 text-white"
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

        {/* Footer with legal links */}
        <div className="mt-2 sm:mt-4 text-center flex-shrink-0">
          <p className="text-xs sm:text-sm text-[#5C8374] mb-1 sm:mb-2">
            By signing in, you agree to our
          </p>
          <div className="flex items-center justify-center gap-2 sm:gap-4 flex-wrap">
            <Link 
              to="/privacy-policy" 
              className="text-xs sm:text-sm text-[#9EC8B9] hover:text-[#5C8374] underline transition-colors"
            >
              {t('privacyPolicy') || 'Privacy Policy'}
            </Link>
            <span className="text-[#5C8374]">•</span>
            <Link 
              to="/terms-of-service" 
              className="text-xs sm:text-sm text-[#9EC8B9] hover:text-[#5C8374] underline transition-colors"
            >
              {t('termsOfService') || 'Terms of Service'}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
