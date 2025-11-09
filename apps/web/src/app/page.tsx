import { redirect } from 'next/navigation';

export default function HomePage() {
  // Redirect to login - auth check happens in dashboard layout
  redirect('/login');
}
