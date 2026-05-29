/**
 * PageLoader — Full-screen branded loading screen
 * Uses the Wildshakes logo centred inside a dual-ring spinner.
 * Displayed by Next.js automatically via loading.tsx files.
 */
export default function PageLoader({ message = 'Loading' }: { message?: string }) {
  return (
    <div className="page-loader">
      {/* Dual spinning ring with logo inside */}
      <div className="page-loader-ring">
        <div className="page-loader-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Wildshakes" />
        </div>
      </div>

      {/* Label with animated dots */}
      <p className="page-loader-text">
        <span className="page-loader-dots">{message}</span>
      </p>
    </div>
  )
}
