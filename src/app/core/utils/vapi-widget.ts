// Vapi web SDK widget loader
// Injects the Vapi script once and starts the floating mic button for the clinic.
// Docs: https://docs.vapi.ai/sdks/web

let loaded = false;

export function startVapiWidget(publicKey: string, assistantId: string): void {
  if (loaded || !publicKey || !assistantId) return;
  loaded = true;

  const script = document.createElement('script');
  script.src   = 'https://cdn.jsdelivr.net/gh/VapiAI/html-script-tag@latest/dist/assets/index.js';
  script.defer = true;
  script.onload = () => {
    // The script exposes window.vapiSDK
    const sdk = (window as unknown as Record<string, unknown>)['vapiSDK'] as
      { run: (opts: Record<string, unknown>) => void } | undefined;
    if (!sdk) return;
    sdk.run({
      apiKey:      publicKey,
      assistant:   assistantId,
      config: {
        position:       'bottom-right',
        offset:         '80px',    // sits above the WhatsApp button
        width:          '50px',
        height:         '50px',
        idle: {
          color:  '#7c3aed',       // purple — distinct from green WhatsApp button
          type:   'round',
          title:  'Talk to us',
          subtitle: 'Click to speak',
          icon:   'https://unpkg.com/lucide-static@0.321.0/icons/mic.svg',
        },
        loading: { color: '#7c3aed', type: 'round' },
        active:  { color: '#dc2626', type: 'round', title: 'Call in progress', icon: 'https://unpkg.com/lucide-static@0.321.0/icons/phone-call.svg' },
      },
    });
  };
  document.head.appendChild(script);
}
