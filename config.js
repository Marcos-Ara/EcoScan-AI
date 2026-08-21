/*
 * EcoScan AI - configuração local.
 * Firebase continua responsável pela autenticação.
 * Supabase é usado como banco de conhecimento do EcoScan.
 * Nunca coloque credenciais administrativas neste arquivo.
 */
window.ECOSCAN_API_BASE = 'http://127.0.0.1:8000';
// Durante o desenvolvimento sem banco/API, deixe false para não gerar erros de rede no console.
// Quando o backend/database estiver pronto, troque para true.
window.ECOSCAN_ENABLE_BACKEND = false;



/* Supabase: banco de conhecimento EcoScan.
 * Use a Project URL e a chave anon/public do Supabase.
 * A chave anon/public pode ser usada no frontend quando RLS
 * estiver corretamente configurado; nunca use service_role aqui.
 */
window.ECOSCAN_SUPABASE_URL = 'https://tekyqhtodsbeqbrvdtqs.supabase.co';
window.ECOSCAN_SUPABASE_ANON_KEY = 'sb_publishable_ai4WJqrDkBS7rcebvaS7KA_hpf0hzOP';
window.ECOSCAN_ENABLE_SUPABASE = true;

window.ECOSCAN_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBMXRb6XSMES6FRQD1INg0-JjU0SD61iGY",
  authDomain: "ecoscan-b8b02.firebaseapp.com",
  projectId: "ecoscan-b8b02",
  storageBucket: "ecoscan-b8b02.firebasestorage.app",
  messagingSenderId: "614088626260",
  appId: "1:614088626260:web:6e09f4695e6840cfa81dc1",
  measurementId: "G-9997KMBGN2"
};
