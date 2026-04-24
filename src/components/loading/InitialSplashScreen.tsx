interface InitialSplashScreenProps {
  appName: string;
  tagline: string;
}

export function InitialSplashScreen({ appName, tagline }: InitialSplashScreenProps) {
  return (
    <div className="gm-splash" role="status" aria-live="polite" aria-label="Carregando aplicativo">
      <style>
        {`
          .gm-splash {
            position: fixed;
            inset: 0;
            z-index: 9999;
            background: linear-gradient(160deg, #A020E0 0%, #6A0DAD 50%, #3d0764 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }
          .gm-splash * { box-sizing: border-box; }
          .gm-splash-shine {
            position: absolute;
            inset: 0;
            background: radial-gradient(circle at 30% 20%, rgba(255,255,255,0.15), transparent 55%);
            pointer-events: none;
          }
          .gm-splash-cloud {
            position: absolute;
            background: rgba(255,255,255,0.08);
            border-radius: 50px;
            animation: gm-drift-cloud 14s linear infinite;
          }
          .gm-splash-cloud::before, .gm-splash-cloud::after {
            content: "";
            position: absolute;
            background: rgba(255,255,255,0.08);
            border-radius: 50%;
          }
          .gm-splash-cloud-1 { width: 90px; height: 26px; top: 20%; left: -120px; }
          .gm-splash-cloud-1::before { width: 36px; height: 36px; top: -16px; left: 14px; }
          .gm-splash-cloud-1::after { width: 28px; height: 28px; top: -12px; left: 44px; }
          .gm-splash-cloud-2 { width: 70px; height: 20px; top: 72%; left: -90px; animation-duration: 18s; animation-delay: 2s; }
          .gm-splash-cloud-2::before { width: 28px; height: 28px; top: -12px; left: 12px; }
          .gm-splash-cloud-3 { width: 80px; height: 22px; top: 84%; left: -110px; animation-duration: 16s; animation-delay: 5s; }
          .gm-splash-cloud-3::before { width: 30px; height: 30px; top: -14px; left: 16px; }
          .gm-splash-cloud-3::after { width: 24px; height: 24px; top: -10px; left: 46px; }
          @keyframes gm-drift-cloud {
            0% { transform: translateX(0); }
            100% { transform: translateX(calc(100vw + 180px)); }
          }
          .gm-splash-stage {
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 32px 20px 120px;
            width: min(360px, 100vw);
          }
          .gm-splash-logo-wrap {
            width: 220px;
            height: 220px;
            position: relative;
          }
          .gm-splash-trail-svg {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            overflow: visible;
          }
          .gm-splash-plane {
            position: absolute;
            top: 0;
            left: 0;
            width: 56px;
            height: 56px;
            margin-left: -28px;
            margin-top: -28px;
            offset-path: path('M 20 180 Q 55 140, 85 105 T 180 35');
            offset-rotate: auto;
            offset-distance: 0%;
            animation: gm-fly-plane 3.6s cubic-bezier(0.42, 0, 0.3, 1) infinite;
          }
          .gm-splash-plane svg {
            width: 100%;
            height: 100%;
            display: block;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15));
          }
          @keyframes gm-fly-plane {
            0%   { offset-distance: 0%; opacity: 0; }
            8%   { opacity: 1; }
            85%  { offset-distance: 100%; opacity: 1; }
            100% { offset-distance: 100%; opacity: 0; }
          }
          .gm-splash-app-name {
            color: #fff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 34px;
            font-weight: 700;
            letter-spacing: 3px;
            margin-top: 16px;
            opacity: 0;
            animation: gm-fade-up 3.6s ease-out 0.6s infinite;
          }
          .gm-splash-tagline {
            color: rgba(255,255,255,0.78);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 13px;
            letter-spacing: 1px;
            opacity: 0;
            animation: gm-fade-up 3.6s ease-out 0.9s infinite;
          }
          @keyframes gm-fade-up {
            0% { opacity: 0; transform: translateY(8px); }
            30%, 80% { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-4px); }
          }
          .gm-splash-dots {
            position: absolute;
            bottom: 48px;
            left: 0;
            right: 0;
            display: flex;
            justify-content: center;
            gap: 10px;
          }
          .gm-splash-dot {
            width: 8px;
            height: 8px;
            border-radius: 9999px;
            background: #fff;
            opacity: 0.4;
            animation: gm-pulse 1.2s ease-in-out infinite;
          }
          .gm-splash-dot:nth-child(2) { animation-delay: 0.2s; }
          .gm-splash-dot:nth-child(3) { animation-delay: 0.4s; }
          @keyframes gm-pulse {
            0%, 100% { opacity: 0.3; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1.2); }
          }
        `}
      </style>
      <div className="gm-splash-shine" />
      <div className="gm-splash-cloud gm-splash-cloud-1" />
      <div className="gm-splash-cloud gm-splash-cloud-2" />
      <div className="gm-splash-cloud gm-splash-cloud-3" />

      <div className="gm-splash-stage">
        <div className="gm-splash-logo-wrap">
          <svg className="gm-splash-trail-svg" viewBox="0 0 220 220" aria-hidden="true">
            <defs>
              <clipPath id="gm-reveal-smoke">
                <path
                  d="M 20 180 Q 55 140, 85 105 T 180 35"
                  stroke="black"
                  strokeWidth="30"
                  fill="none"
                  strokeLinecap="round"
                  pathLength="100"
                  strokeDasharray="100"
                  strokeDashoffset="100"
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    values="100;100;0;0"
                    keyTimes="0;0.08;0.85;1"
                    dur="3.6s"
                    repeatCount="indefinite"
                  />
                </path>
              </clipPath>
            </defs>
            <path
              d="M 20 180 Q 55 140, 85 105 T 180 35"
              fill="none"
              stroke="rgba(255,255,255,0.92)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray="8 11"
              clipPath="url(#gm-reveal-smoke)"
            />
          </svg>

          <div className="gm-splash-plane" aria-hidden="true">
            <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 30 L16 22 L20 22 L16 30 Z" fill="white" />
              <path d="M8 34 L16 42 L20 42 L16 34 Z" fill="white" />
              <path d="M28 28 L38 10 L44 10 L36 28 Z" fill="white" />
              <path d="M28 36 L38 54 L44 54 L36 36 Z" fill="white" />
              <path d="M10 32 C 10 30, 14 28.5, 20 28 L 46 26.5 C 54 26, 60 28.5, 61 32 C 60 35.5, 54 38, 46 37.5 L 20 36 C 14 35.5, 10 34, 10 32 Z" fill="white" />
              <circle cx="55" cy="31.5" r="1.4" fill="#6A0DAD" opacity="0.75" />
            </svg>
          </div>
        </div>

        <div className="gm-splash-app-name">{appName}</div>
        <div className="gm-splash-tagline">{tagline}</div>
      </div>

      <div className="gm-splash-dots" aria-hidden="true">
        <div className="gm-splash-dot" />
        <div className="gm-splash-dot" />
        <div className="gm-splash-dot" />
      </div>
    </div>
  );
}
