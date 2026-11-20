import type { StudentProject } from './types';
const KEY = 'fieldwork-guest-projects-v1';
export function guestProjects(): StudentProject[] {
  const text = localStorage.getItem(KEY);
  if (!text) return [];
  const value = JSON.parse(text);
  if (!Array.isArray(value) || value.some(p => !p || typeof p.id !== 'string' || !Array.isArray(p.papers) || !Array.isArray(p.analyses))) throw Error('The browser project store is unreadable. Keep any open work and export a backup.');
  return value;
}
export function saveGuest(project: StudentProject) {
  if (project.papers.length > 12 || project.papers.reduce((sum, p) => sum + p.textPages.reduce((n, page) => n + page.text.length, 0), 0) > 500000) throw Error('This project exceeds its paper/text capacity. Remove a paper or create another project.');
  if (project.fromYear && project.toYear && project.fromYear > project.toYear) throw Error('The start year must not be later than the end year.');
  const existing = guestProjects();
  const saved = { ...project, id: project.id && project.id !== 'prepared-open-access' ? project.id : crypto.randomUUID(), revision: project.revision + 1, updatedAt: new Date().toISOString() };
  const next = [saved, ...existing.filter(p => p.id !== saved.id)];
  try { localStorage.setItem(KEY, JSON.stringify(next)); }
  catch { throw Error('This browser could not save the project. Export a backup before leaving, or free browser storage.'); }
  return saved;
}
export function deleteGuest(id: string) { localStorage.setItem(KEY, JSON.stringify(guestProjects().filter(p => p.id !== id))); }
