// Satır İzi bulut ayarları (Emanet ve Sefer ile aynı Supabase projesi).
// supabaseUrl veya supabaseKey boşsa uygulama yalnızca bu cihazda çalışır; hesap bölümü gizlenir.
// Değerler: Supabase paneli → Project Settings → API → "Project URL" ve "publishable / anon" anahtarı.
// Bu anahtar herkese açık olacak şekilde tasarlanmıştır; verileri satır güvenliği (RLS) korur.
export const CONFIG = {
  supabaseUrl: 'https://clwgjupnigenndbbkcnk.supabase.co',
  supabaseKey: 'sb_publishable_ankAPHs2d9ja8bJNIL8sIA_L8O4jVNq',
  stateTable: 'satir_izi_state',
  backupTable: 'satir_izi_backup',
  backupDays: 30,
};
