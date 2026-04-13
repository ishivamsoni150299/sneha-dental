// ElevenLabs Conversational AI widget loader
// Injects the web-component widget for the clinic's AI receptionist.
// Docs: https://elevenlabs.io/docs/conversational-ai/guides/conversational-ai-guide-nextjs

let injected = false;

export function startElevenLabsWidget(agentId: string): void {
  if (injected || !agentId) return;
  injected = true;

  // 1. Inject the embed script (provides the <elevenlabs-convai> custom element)
  const script = document.createElement('script');
  script.src   = 'https://unpkg.com/@elevenlabs/convai-widget-embed';
  script.type  = 'text/javascript';
  script.async = true;
  document.head.appendChild(script);

  // 2. Add the widget element — it becomes the floating mic button
  const widget = document.createElement('elevenlabs-convai');
  widget.setAttribute('agent-id', agentId);

  // Position: bottom-right, above the WhatsApp button (which sits at bottom-6/right-6 = 24px)
  // The widget has its own internal FAB styling; we just position the host element.
  widget.style.cssText = 'position:fixed;bottom:96px;right:24px;z-index:49';

  document.body.appendChild(widget);
}
