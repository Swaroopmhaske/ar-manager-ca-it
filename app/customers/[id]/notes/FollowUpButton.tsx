"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markFollowUpDone } from "../../actions";

export default function FollowUpButton({
  noteId,
  customerId,
}: {
  noteId: number;
  customerId: number;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleDone() {
    setSaving(true);

    const result = await markFollowUpDone({
      noteId,
      customerId,
    });

    if (!result.success) {
      alert(result.error);
      setSaving(false);
      return;
    }

    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDone}
      disabled={saving}
      className="ml-2 rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
    >
      {saving ? "Saving..." : "Mark Done"}
    </button>
  );
}