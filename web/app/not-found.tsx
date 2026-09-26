import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <div className="eyebrow">404</div>
      <h1>Not in the index</h1>
      <p className="lede">This page does not exist, or the item is not published yet.</p>
      <p><Link href="/" className="btn">Back to the index</Link></p>
    </>
  );
}
