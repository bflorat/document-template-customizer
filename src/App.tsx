import { useEffect, useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import { fetchTemplateAndViews, ViewFetchError, type TemplateWithViews } from './fetchTemplateMetadata'


const BASE='https://raw.githubusercontent.com/bflorat/architecture-document-template/refs/heads/feat/add-medadata';
let res;

async function fetch () {
  res = await fetchTemplateAndViews(`${BASE}//`, { fetchImpl: fetchMock, concurrency: 2 });
}

const App = ()=> {
    const [data, setData] = useState<TemplateWithViews | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
   

   useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchTemplateAndViews(BASE)
      .then(result => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          if (err instanceof ViewFetchError) {
            setError(`Some views failed: ${err.failures.map(f => f.file).join(", ")}`);
          } else {
            setError(err.message);
          }
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

   if (loading) return <p>Loading…</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  if (!data) return null;

  return (
    <div>
      <h1>Template: {data.metadata.data.author}</h1>
      <p>License: {data.metadata.data.license}</p>

      <h2>Views</h2>
      <ul>
        {data.views.map(v => (
          <li key={v.file}>
            <h3>{v.name}</h3>
            <pre>{v.content}</pre>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App
