import { useQuery } from '@tanstack/react-query';
import { useFetchApplications } from '../api';
import { useUI } from '../contexts/UIContext';
import Spinner from './Spinner';
import type { Application } from '../types';

export default function ApplicationList() {
  const fetchApplications = useFetchApplications();
  const { data: applications, isLoading, isError } = useQuery({
    queryKey: ['applications'],
    queryFn: fetchApplications,
  });
  const { selectListAsset } = useUI();

  if (isLoading) return <Spinner />;
  if (isError) return <div>Error loading applications</div>;

  return (
    <table className="w-full mt-4 text-left">
      <thead>
        <tr>
          <th className="p-2">Company</th>
          <th className="p-2">Role</th>
          <th className="p-2">Resume</th>
          <th className="p-2">Cover Letter</th>
          <th className="p-2">Form</th>
          <th className="p-2">Status</th>
        </tr>
      </thead>
      <tbody>
        {applications?.map((app: Application) => (
          <tr key={app.sessionId} className="border-b">
            <td className="p-2">{app.companyName || app.company_name || app.applicationDetails?.companyInfo?.name || 'Unknown'}</td>
            <td className="p-2">{app.applicationDetails?.jobInfo?.title || 'Unknown'}</td>
            <td className="p-2">
              {app.adjustedResume && (
                <button type="button" onClick={() => selectListAsset(app.adjustedResume!, 'md')} className="text-blue-500 hover:underline">View</button>
              )}
            </td>
            <td className="p-2">
              {app.cover_letter && (
                <button type="button" onClick={() => selectListAsset(app.cover_letter!, 'md')} className="text-blue-500 hover:underline">View</button>
              )}
            </td>
            <td className="p-2">
              {app.form && (
                <button type="button" onClick={() => selectListAsset(app.form!, 'form')} className="text-blue-500 hover:underline">View</button>
              )}
            </td>
            <td className="p-2">
              <span className={`px-2 py-1 rounded text-xs ${
                app.status === 'completed' ? 'bg-green-100 text-green-800' :
                app.status === 'failed' ? 'bg-red-100 text-red-800' :
                app.status === 'awaiting_input' ? 'bg-yellow-100 text-yellow-800' :
                'bg-blue-100 text-blue-800'
              }`}>
                {app.status}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
