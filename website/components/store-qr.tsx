// The modules encode STORE_LINK_URL from lib/links.ts (error correction M,
// 25×25), which sends Android to Google Play and everything else to the App
// Store.
// Regenerate them if that link changes, or the code opens the old page.
const SIZE = 25;
const MODULES =
  "M0 0h7v1H0zM8 0h4v1H8zM14 0h1v1H14zM18 0h7v1H18zM0 1h1v1H0z" +
  "M6 1h1v1H6zM9 1h1v1H9zM12 1h3v1H12zM16 1h1v1H16zM18 1h1v1H18z" +
  "M24 1h1v1H24zM0 2h1v1H0zM2 2h3v1H2zM6 2h1v1H6zM8 2h1v1H8z" +
  "M11 2h6v1H11zM18 2h1v1H18zM20 2h3v1H20zM24 2h1v1H24z" +
  "M0 3h1v1H0zM2 3h3v1H2zM6 3h1v1H6zM11 3h5v1H11zM18 3h1v1H18z" +
  "M20 3h3v1H20zM24 3h1v1H24zM0 4h1v1H0zM2 4h3v1H2zM6 4h1v1H6z" +
  "M14 4h1v1H14zM18 4h1v1H18zM20 4h3v1H20zM24 4h1v1H24z" +
  "M0 5h1v1H0zM6 5h1v1H6zM8 5h1v1H8zM10 5h4v1H10zM18 5h1v1H18z" +
  "M24 5h1v1H24zM0 6h7v1H0zM8 6h1v1H8zM10 6h1v1H10zM12 6h1v1H12z" +
  "M14 6h1v1H14zM16 6h1v1H16zM18 6h7v1H18zM9 7h1v1H9z" +
  "M14 7h1v1H14zM16 7h1v1H16zM0 8h1v1H0zM2 8h1v1H2zM6 8h2v1H6z" +
  "M9 8h1v1H9zM12 8h3v1H12zM16 8h1v1H16zM19 8h1v1H19z" +
  "M22 8h1v1H22zM24 8h1v1H24zM4 9h2v1H4zM9 9h2v1H9zM13 9h1v1H13z" +
  "M15 9h5v1H15zM21 9h1v1H21zM23 9h2v1H23zM3 10h5v1H3z" +
  "M9 10h1v1H9zM12 10h1v1H12zM15 10h1v1H15zM17 10h6v1H17z" +
  "M24 10h1v1H24zM1 11h2v1H1zM5 11h1v1H5zM9 11h3v1H9z" +
  "M13 11h1v1H13zM15 11h2v1H15zM19 11h3v1H19zM2 12h5v1H2z" +
  "M8 12h1v1H8zM10 12h4v1H10zM16 12h1v1H16zM18 12h2v1H18z" +
  "M24 12h1v1H24zM2 13h1v1H2zM8 13h1v1H8zM12 13h1v1H12z" +
  "M15 13h1v1H15zM18 13h2v1H18zM23 13h2v1H23zM0 14h5v1H0z" +
  "M6 14h3v1H6zM12 14h5v1H12zM21 14h2v1H21zM24 14h1v1H24z" +
  "M2 15h2v1H2zM8 15h5v1H8zM14 15h1v1H14zM17 15h1v1H17z" +
  "M19 15h3v1H19zM0 16h2v1H0zM3 16h1v1H3zM5 16h3v1H5z" +
  "M10 16h1v1H10zM13 16h2v1H13zM16 16h5v1H16zM23 16h1v1H23z" +
  "M8 17h1v1H8zM10 17h1v1H10zM13 17h4v1H13zM20 17h1v1H20z" +
  "M24 17h1v1H24zM0 18h7v1H0zM8 18h2v1H8zM11 18h1v1H11z" +
  "M16 18h1v1H16zM18 18h1v1H18zM20 18h1v1H20zM24 18h1v1H24z" +
  "M0 19h1v1H0zM6 19h1v1H6zM10 19h1v1H10zM13 19h1v1H13z" +
  "M15 19h2v1H15zM20 19h1v1H20zM23 19h2v1H23zM0 20h1v1H0z" +
  "M2 20h3v1H2zM6 20h1v1H6zM10 20h4v1H10zM15 20h6v1H15z" +
  "M23 20h2v1H23zM0 21h1v1H0zM2 21h3v1H2zM6 21h1v1H6z" +
  "M10 21h1v1H10zM12 21h1v1H12zM15 21h2v1H15zM20 21h1v1H20z" +
  "M22 21h2v1H22zM0 22h1v1H0zM2 22h3v1H2zM6 22h1v1H6zM8 22h2v1H8z" +
  "M12 22h6v1H12zM19 22h3v1H19zM23 22h2v1H23zM0 23h1v1H0z" +
  "M6 23h1v1H6zM9 23h4v1H9zM14 23h1v1H14zM16 23h5v1H16z" +
  "M0 24h7v1H0zM8 24h2v1H8zM13 24h2v1H13zM16 24h2v1H16z" +
  "M21 24h1v1H21zM24 24h1v1H24z";

export function StoreQr({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`-3 -3 ${SIZE + 6} ${SIZE + 6}`}
      role="img"
      aria-label="QR code that opens lpm Link in your phone's app store"
      shapeRendering="crispEdges"
      className={className}
    >
      <rect x="-3" y="-3" width={SIZE + 6} height={SIZE + 6} fill="#fff" />
      <path d={MODULES} fill="#000" />
    </svg>
  );
}
