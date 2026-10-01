import { createRoot } from 'react-dom/client';
import { StandaloneApp } from './App';
import { deserializeProject } from './model';
import '../../index.css';

const root = document.getElementById('root')!;
try {
  const project = deserializeProject(
    document.getElementById('app-project')!.textContent!,
  );
  createRoot(root).render(<StandaloneApp project={project} />);
} catch (error) {
  root.setAttribute('role', 'alert');
  root.textContent =
    error instanceof Error ? error.message : 'Invalid application data.';
}
