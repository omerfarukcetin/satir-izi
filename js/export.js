// Markdown (Obsidian uyumlu), TXT ve CSV dışa aktarma.
import { state, highlightsOf, notesOf } from './store.js';
import { comparePage, compareTr, download, slugify, formatDate } from './utils.js';
import { statusLabel, markLabel } from './database.js';
import { relatedOf } from './links.js';
import { bookById } from './store.js';
import { reportToMarkdown } from './report.js';

const sortedHighlights = bookId => highlightsOf(bookId).sort((a, b) => comparePage(a.page, b.page) || a.createdAt.localeCompare(b.createdAt));
const tagify = t => '#' + t.trim().replace(/\s+/g, '-').replace(/[#,]/g, '');
// Markdown başlığında satır sonu olmasın
const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim();

// Obsidian: ilgili kayıtlar kitap notuna [[Kitap adı]] bağlantısıyla gösterilir
function relatedRefs(id) {
  return relatedOf(id).map(r => {
    const b = bookById(r.item.bookId);
    const what = r.type === 'highlight' ? (r.item.page ? `s. ${r.item.page}` : 'alıntı') : 'not';
    return b ? `[[${oneLine(b.title)}]] (${what})` : '';
  }).filter(Boolean).join(', ');
}

export function bookToMarkdown(book) {
  const lines = [`# ${oneLine(book.title)}`, '', `Yazar: ${oneLine(book.author) || '—'}`];
  if (book.publisher) lines.push(`Yayınevi: ${oneLine(book.publisher)}`);
  if (book.isbn) lines.push(`ISBN: ${book.isbn}`);
  if (book.category) lines.push(`Kategori: ${oneLine(book.category)}`);
  lines.push(`Durum: ${statusLabel(book.status)}`);
  if (book.rating) lines.push(`Puan: ${'★'.repeat(book.rating)}${'☆'.repeat(5 - book.rating)}`);
  lines.push('');
  if (book.review?.trim()) lines.push('## Değerlendirme', '', book.review.trim(), '');
  if (book.report?.data) lines.push(reportToMarkdown(book.report), '');
  const notes = notesOf(book.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (notes.length) {
    lines.push('## Kişisel notlar', '');
    for (const n of notes) {
      lines.push(n.text.trim(), '');
      if (n.tags?.length) lines.push(`**Etiketler:** ${n.tags.map(tagify).join(' ')}`, '');
      const rel = relatedRefs(n.id); if (rel) lines.push(`**İlgili:** ${rel}`, '');
    }
  }
  let lastPage = null;
  for (const h of sortedHighlights(book.id)) {
    const page = h.page ? `Sayfa ${oneLine(h.page)}` : 'Sayfa belirtilmedi';
    if (page !== lastPage) { lines.push(`## ${page}`, ''); lastPage = page; }
    lines.push(h.text.split('\n').map(l => '> ' + l).join('\n'), '');
    if (h.comment?.trim()) lines.push(`**Kişisel not:** ${h.comment.trim()}`, '');
    if (h.tags?.length) lines.push(`**Etiketler:** ${h.tags.map(tagify).join(' ')}`, '');
    const rel = relatedRefs(h.id); if (rel) lines.push(`**İlgili:** ${rel}`, '');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function bookToText(book) {
  const out = [book.title, `Yazar: ${book.author || '—'}`, ''];
  for (const h of sortedHighlights(book.id)) {
    out.push(`[${h.page ? 's. ' + h.page : 'sayfa yok'}]`, h.text);
    if (h.comment?.trim()) out.push(`Notum: ${h.comment.trim()}`);
    out.push('');
  }
  return out.join('\n');
}

function csvCell(v) {
  let s = String(v ?? '');
  // Tablo programlarında formül enjeksiyonunu önle
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export function highlightsToCsv(books) {
  const header = ['Kitap', 'Yazar', 'Sayfa', 'Alıntı', 'Kişisel not', 'İşaret türü', 'Etiketler', 'Favori', 'Eklenme tarihi'];
  const rows = [header];
  for (const b of books) {
    for (const h of sortedHighlights(b.id)) {
      rows.push([b.title, b.author, h.page, h.text, h.comment, markLabel(h.markType), (h.tags || []).join(', '), h.favorite ? 'Evet' : 'Hayır', formatDate(h.createdAt)]);
    }
  }
  // Excel'in Türkçe karakterleri doğru açması için BOM
  return '﻿' + rows.map(r => r.map(csvCell).join(';')).join('\r\n');
}

const allBooksSorted = () => [...state.books].sort((a, b) => compareTr(a.title, b.title));

export function exportBook(book, format) {
  const name = `satir-izi-${slugify(book.title)}`;
  if (format === 'md') download(`${name}.md`, bookToMarkdown(book), 'text/markdown;charset=utf-8');
  else if (format === 'txt') download(`${name}.txt`, bookToText(book), 'text/plain;charset=utf-8');
  else if (format === 'csv') download(`${name}.csv`, highlightsToCsv([book]), 'text/csv;charset=utf-8');
}

export function exportAll(format) {
  const books = allBooksSorted();
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'md') download(`satir-izi-tum-kitaplar-${stamp}.md`, books.map(bookToMarkdown).join('\n---\n\n'), 'text/markdown;charset=utf-8');
  else if (format === 'txt') download(`satir-izi-tum-kitaplar-${stamp}.txt`, books.map(bookToText).join('\n==========\n\n'), 'text/plain;charset=utf-8');
  else if (format === 'csv') download(`satir-izi-alintilar-${stamp}.csv`, highlightsToCsv(books), 'text/csv;charset=utf-8');
}
