import { useEffect, useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import { fetchTemplateAndViews } from './fetchTemplateMetadata'
import { ViewFetchError, type TemplateWithViews, type ViewSection, type TemplateLabelDefinition } from './model'


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

      {renderLabels(data.metadata.data.labels ?? [])}

      <h2>Views</h2>
      <div className="views-grid">
        {data.views.map(v => (
          <section key={v.file} className="view-card">
            <h3>{v.name}</h3>
            <pre>{formatSections(v.sections ?? [])}</pre>
          </section>
        ))}
      </div>
    </div>
  );
}

export default App

function formatSections(sections: ViewSection[], depth = 0): string {
  return sections
    .map(section => {
      const indentation = '  '.repeat(depth);
      const metaParts: string[] = [];
      if (section.metadata?.id) {
        metaParts.push(`id=${section.metadata.id}`);
      }
      if (section.metadata?.labels?.length) {
        metaParts.push(`labels=${section.metadata.labels.join('|')}`);
      }
      if (section.metadata?.links?.length) {
        metaParts.push(`links=${section.metadata.links.join('|')}`);
      }
      const metaSuffix = metaParts.length ? ` [${metaParts.join(' ')}]` : '';
      const header = `${indentation}- ${section.title}${metaSuffix}`;
      const children = section.children.length ? `\n${formatSections(section.children, depth + 1)}` : '';
      return `${header}${children}`;
    })
    .join('\n');
}

function renderLabels(labels: TemplateLabelDefinition[]): JSX.Element | null {
  if (!labels.length) return null;
  return (
    <section className="labels-section">
      <h2>Labels</h2>
      <ul className="labels-list">
        {labels.map(label => (
          <li key={label.name}>
            <strong>{label.name}</strong>
            {label.available_values?.length ? (
              <span>: {label.available_values.join(', ')}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
