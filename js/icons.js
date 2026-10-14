const paths = {
  photos: '<rect x="3" y="5" width="18" height="15" rx="3"/><circle cx="8" cy="10" r="1.5"/><path d="m4 17 5-4 3 2 4-5 5 7"/>',
  camera: '<path d="M4 7h4l2-3h4l2 3h4a1 1 0 0 1 1 1v11H3V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="4"/>',
  resize: '<path d="M8 3H3v5M16 21h5v-5M3 3l6 6M21 21l-6-6"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  compress: '<path d="m4 4 5 5M4 9h5V4M20 20l-5-5M15 20v-5h5M20 4l-5 5M15 4v5h5M4 20l5-5M9 20v-5H4"/>',
  format: '<path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h4M8 12h7M8 16h5"/>',
  shortcuts: '<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  share: '<path d="M12 16V3m-4 4 4-4 4 4M7 11H4v10h16V11h-3"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 10v7M14 10v7"/>',
  settings: '<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle cx="12" cy="12" r="4"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  play: '<path d="m8 4 12 8-12 8V4Z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/>',
};
export function icon(name, className = '') {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.photos}</svg>`;
}
