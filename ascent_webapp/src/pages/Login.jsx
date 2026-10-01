import React from 'react';
import { MotionConfig } from 'motion/react';
import { useAuthFlow } from '@/components/auth/useAuthFlow';
import { GoogleHost } from '@/components/auth/AuthParts';
import SummitLogin from '@/components/auth/SummitLogin';

export default function Login() {
  const flow = useAuthFlow();
  return (
    <MotionConfig reducedMotion="user">
      <SummitLogin flow={flow} />
      <GoogleHost flow={flow} />
    </MotionConfig>
  );
}
