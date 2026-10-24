import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-bg-primary text-text-primary">
      <h1 className="text-6xl font-black">404</h1>
      <p className="text-xl mt-2 text-text-muted">Page not found</p>
      <Link to="/admin" className="mt-6 px-5 py-2 rounded-lg bg-primary text-white">Go back to dashboard</Link>
    </div>
  );
}
