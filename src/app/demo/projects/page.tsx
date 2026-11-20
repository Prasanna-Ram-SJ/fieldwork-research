import { StudentDesk } from '@/components/StudentDesk';
import '../../projects/projects.css';
import '../demo.css';
export const metadata = { title: 'Try a student project — Fieldwork' };
export default function GuestProjectsPage() { return <StudentDesk localMode />; }
