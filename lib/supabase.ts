import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vuastahamhqsxjqfuxok.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1YXN0YWhhbWhxc3hqcWZ1eG9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjMyNzksImV4cCI6MjA5NTM5OTI3OX0.I5FeH53S4RxQQepuT0bD-jxN1xiF72lagfndy-tGX4c';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
