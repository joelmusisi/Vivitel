interface PageShellProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export function PageShell({ title, description, children }: PageShellProps) {
  return (
    <div className="page">
      <section className="token-card">
        <div className="token-header">
          <div>
            <p className="eyebrow">Page</p>
            <h2>{title}</h2>
            {description && <p className="token-sub">{description}</p>}
          </div>
        </div>
        {children ?? <div className="token-empty">Content placeholder for {title}.</div>}
      </section>
    </div>
  );
}

export default PageShell;
