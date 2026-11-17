"use client";

/** Last-resort error page when the root layout itself fails. Plain HTML: the app's styles may not be loaded. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="id">
      <body style={{ fontFamily: "system-ui, sans-serif", color: "#4D4D4F", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, padding: 16, textAlign: "center" }}>
        <main role="alert">
          <h1 style={{ fontSize: 22 }}>Portal belum bisa dibuka</h1>
          <p style={{ maxWidth: 420 }}>
            Terjadi gangguan saat memuat aplikasi. Data Anda aman. Coba muat ulang; bila masih gagal, hubungi Super Admin yayasan
            {error.digest ? ` dan sebutkan kode ${error.digest}` : ""}.
          </p>
          <button type="button" onClick={() => reset()} style={{ background: "#0E4E96", color: "#fff", border: 0, borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>
            Coba lagi
          </button>
        </main>
      </body>
    </html>
  );
}
