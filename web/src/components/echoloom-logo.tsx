export default function EchoLoomLogo() {
  return <a className="brand" href="#top" aria-label="EchoLoom home">
    <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true" fill="none">
      <path d="M12 11.5c4-3.5 11.5-2.7 14 1.6 2.2 3.9.4 7.2-3 9.3-3.5 2.2-5.2 5.6-3 9.4 2.4 4.2 9.5 4.8 13.2 1.3" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M28 11.5c-4-3.5-11.5-2.7-14 1.6-2.2 3.9-.4 7.2 3 9.3 3.5 2.2 5.2 5.6 3 9.4-2.4 4.2-9.5 4.8-13.2 1.3" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" opacity=".55" />
      <circle cx="20" cy="20" r="2.2" fill="currentColor" />
    </svg>
    <span className="brand-name"><span>Echo</span><b>Loom</b></span>
  </a>;
}
