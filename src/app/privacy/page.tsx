import { Metadata } from 'next';
import { readFileSync } from 'fs';
import { join } from 'path';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Privacy Policy | Manuva',
  description:
    'Manuva privacy policy - How we collect, use, and protect your personal information in accordance with Australian Privacy Principles.',
  alternates: {
    canonical: 'https://manuva.app/privacy',
  },
  openGraph: {
    title: 'Privacy Policy | Manuva',
    description:
      'Manuva privacy policy - How we collect, use, and protect your personal information in accordance with Australian Privacy Principles.',
    url: 'https://manuva.app/privacy',
    siteName: 'Manuva',
    type: 'website',
  },
};

// Lightweight markdown parser
function parseMarkdown(markdown: string): string {
  let html = markdown;

  // Escape HTML entities in the entire text
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Process markdown line by line
  const lines = html.split('\n');
  let result = [];
  let inList = false;
  let inTable = false;
  let tableRows = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Handle headings
    if (line.match(/^#{1,6} /)) {
      const level = line.match(/^#+/)[0].length;
      const text = line.replace(/^#+\s+/, '');
      result.push(`<h${level}>${text}</h${level}>`);
      inList = false;
    }
    // Handle horizontal rules
    else if (line.match(/^-{3,}$/)) {
      result.push('<hr />');
      inList = false;
    }
    // Handle unordered list items
    else if (line.match(/^-\s+/)) {
      if (!inList) {
        result.push('<ul>');
        inList = true;
      }
      const text = line.replace(/^-\s+/, '');
      result.push(`<li>${text}</li>`);
    }
    // Handle ordered list items
    else if (line.match(/^\d+\.\s+/)) {
      if (!inList) {
        result.push('<ol>');
        inList = true;
      }
      const text = line.replace(/^\d+\.\s+/, '');
      result.push(`<li>${text}</li>`);
    }
    // Handle table lines
    else if (line.includes('|')) {
      inList = false;
      tableRows.push(line);
    }
    // Handle blank lines
    else if (!line.trim()) {
      if (inList) {
        result.push(inList === 'ul' ? '</ul>' : '</ol>');
        inList = false;
      }
      if (tableRows.length > 0) {
        result.push(parseTable(tableRows));
        tableRows = [];
        inTable = false;
      }
      result.push('');
    }
    // Handle regular paragraphs
    else if (line.trim()) {
      if (inList) {
        result.push(inList === 'ul' ? '</ul>' : '</ol>');
        inList = false;
      }
      result.push(line);
    }
  }

  // Close any open lists
  if (inList) {
    result.push(inList === 'ul' ? '</ul>' : '</ol>');
  }
  if (tableRows.length > 0) {
    result.push(parseTable(tableRows));
  }

  html = result.join('\n');

  // Process inline formatting
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Wrap paragraphs
  html = html
    .split('\n\n')
    .map((para) => {
      if (
        para.trim() &&
        !para.trim().startsWith('<') &&
        !para.trim().startsWith('</') &&
        !para.includes('<table')
      ) {
        return `<p>${para}</p>`;
      }
      return para;
    })
    .join('\n');

  return html;
}

function parseTable(lines: string[]): string {
  if (lines.length < 2) return '';

  const headerLine = lines[0];
  const separatorLine = lines[1];

  // Check if it's a valid table
  if (!separatorLine.includes('|') || !separatorLine.includes('-')) {
    return lines.join('\n');
  }

  const headers = headerLine
    .split('|')
    .slice(1, -1)
    .map((h) => h.trim());
  const rows = lines
    .slice(2)
    .filter((line) => line.includes('|'))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim())
    );

  let table = '<table><thead><tr>';
  headers.forEach((header) => {
    table += `<th>${header}</th>`;
  });
  table += '</tr></thead><tbody>';

  rows.forEach((row) => {
    table += '<tr>';
    row.forEach((cell) => {
      table += `<td>${cell}</td>`;
    });
    table += '</tr>';
  });

  table += '</tbody></table>';
  return table;
}

async function getPrivacyPolicy() {
  try {
    const filePath = join(process.cwd(), 'public/docs/privacy-policy.md');
    return readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error('Error reading privacy policy:', error);
    return '# Privacy Policy\n\nError loading privacy policy.';
  }
}

export default async function PrivacyPage() {
  const markdown = await getPrivacyPolicy();
  const htmlContent = parseMarkdown(markdown);

  return (
    <div className={styles.privacyContainer}>
      <article className={styles.privacyContent}>
        <div
          className={styles.markdownBody}
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </article>
    </div>
  );
}
