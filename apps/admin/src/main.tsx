import '@fontsource-variable/inter';
import '@fontsource/playfair-display/500.css';
import '@fontsource/playfair-display/600.css';
import './styles/globals.css';

/**
 * Entry point. A pre-launch locked production build (`__PK_ADMIN_LOCKED__`, see vite.config.ts and
 * `lib/launch-mode.ts`) renders only a 404; the constant is replaced at build time, so the unused
 * branch and the whole app it imports are dropped from that bundle.
 */
const root = document.getElementById('root');
if (!root) throw new Error('#root element missing from index.html');

if (__PK_ADMIN_LOCKED__) {
  void import('./app/locked').then(({ mountLocked }) => mountLocked(root));
} else {
  void import('./app/bootstrap').then(({ mountApp }) => mountApp(root));
}
