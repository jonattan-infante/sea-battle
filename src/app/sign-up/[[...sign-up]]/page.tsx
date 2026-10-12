import { SignUp } from '@clerk/nextjs';
import AuthShell from '../../../components/AuthShell';
import { SIGN_UP_APPEARANCE } from '../../../lib/clerk-theme';

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUp appearance={SIGN_UP_APPEARANCE} />
    </AuthShell>
  );
}
