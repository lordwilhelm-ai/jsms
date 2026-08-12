import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { logActivity, actorName } from "@/lib/activityLog";

const ALLOWED_ROLES = ["owner", "admin", "headmaster"] as const;

function numberValue(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function supplierStatus(totalAmount: number, amountPaid: number) {
  if (amountPaid <= 0) return "unpaid";
  if (amountPaid >= totalAmount) return "paid";
  return "partial";
}

// Recording a supplier purchase used to run entirely in the browser: insert
// the purchase, insert its line items, then loop through each item finding
// or creating the matching jsms_books row and adjusting its stock — one
// sequential await per item, straight from the client. Closing the tab or
// losing connection partway left the purchase + line items saved but stock
// only partially updated, with no record of which books were missed — the
// same failure mode the old student-promote flow had. This route does the
// whole thing server-side in one request instead.
export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();

    const supplierName = cleanText(body?.supplierName);
    if (!supplierName) {
      return NextResponse.json({ error: "Enter supplier name." }, { status: 400 });
    }

    const items: Array<{
      book_name: string;
      subject: string;
      class_name: string;
      quantity: string | number;
      cost_price: string | number;
      selling_price: string | number;
    }> = Array.isArray(body?.items) ? body.items : [];

    if (items.length === 0) {
      return NextResponse.json({ error: "Add at least one book item." }, { status: 400 });
    }

    const totalAmount = items.reduce(
      (sum, item) => sum + numberValue(item.quantity) * numberValue(item.cost_price),
      0
    );
    const amountPaid = numberValue(body?.amountPaid);

    if (amountPaid < 0 || amountPaid > totalAmount) {
      return NextResponse.json({ error: "Amount paid is not valid." }, { status: 400 });
    }

    const balance = totalAmount - amountPaid;
    const status = supplierStatus(totalAmount, amountPaid);
    const staffName = actorName(auth.teacher);

    const { data: purchaseData, error: purchaseError } = await supabaseAdmin
      .from("jsms_book_supplier_purchases")
      .insert({
        supplier_name: supplierName,
        supplier_phone: cleanText(body?.supplierPhone) || null,
        supplier_receipt_number: cleanText(body?.supplierReceiptNumber) || null,
        purchase_date: cleanText(body?.purchaseDate) || new Date().toISOString().slice(0, 10),
        bought_on_credit: Boolean(body?.boughtOnCredit),
        total_amount: totalAmount,
        amount_paid: amountPaid,
        balance,
        payment_method: cleanText(body?.paymentMethod) || null,
        payment_status: status,
        paid_by: staffName,
        notes: cleanText(body?.notes) || null,
      })
      .select("*")
      .single();

    if (purchaseError || !purchaseData) {
      throw new Error(purchaseError?.message || "Could not save supplier purchase.");
    }

    const itemRows = items.map((item) => ({
      purchase_id: purchaseData.id,
      book_id: null,
      book_name: cleanText(item.book_name),
      subject: cleanText(item.subject) || null,
      class_name: cleanText(item.class_name),
      quantity: numberValue(item.quantity),
      cost_price: numberValue(item.cost_price),
      selling_price: numberValue(item.selling_price),
      total_cost: numberValue(item.quantity) * numberValue(item.cost_price),
    }));

    const { error: itemError } = await supabaseAdmin
      .from("jsms_book_supplier_purchase_items")
      .insert(itemRows);

    if (itemError) {
      throw new Error(`Supplier saved, but book items failed: ${itemError.message}`);
    }

    const { data: existingBooks, error: booksError } = await supabaseAdmin
      .from("jsms_books")
      .select("id, book_name, class_name, subject, quantity");

    if (booksError) throw new Error(booksError.message);

    for (const item of itemRows) {
      const existing = (existingBooks || []).find(
        (book) =>
          String(book.book_name || "").toLowerCase() === item.book_name.toLowerCase() &&
          String(book.class_name || "").toLowerCase() === (item.class_name || "").toLowerCase() &&
          String(book.subject || "").toLowerCase() === (item.subject || "").toLowerCase()
      );

      if (existing) {
        const { error: updateError } = await supabaseAdmin
          .from("jsms_books")
          .update({
            quantity: numberValue(existing.quantity) + item.quantity,
            cost_price: item.cost_price,
            selling_price: item.selling_price,
            supplier_name: supplierName,
          })
          .eq("id", existing.id);
        if (updateError) throw new Error(updateError.message);
      } else {
        const { error: insertError } = await supabaseAdmin.from("jsms_books").insert({
          book_name: item.book_name,
          class_name: item.class_name,
          subject: item.subject,
          quantity: item.quantity,
          cost_price: item.cost_price,
          selling_price: item.selling_price,
          supplier_name: supplierName,
        });
        if (insertError) throw new Error(insertError.message);
      }
    }

    void logActivity({
      userName: staffName,
      role: auth.role,
      action: "BOOKS_SUPPLIER_PURCHASE",
      details: `Recorded supplier purchase from ${supplierName}: ${itemRows.length} book line(s), GHS ${totalAmount.toFixed(2)} total, GHS ${amountPaid.toFixed(2)} paid.`,
    });

    return NextResponse.json({ message: "Supplier purchase saved and stock updated.", purchase: purchaseData });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Something went wrong." },
      { status: 500 }
    );
  }
}
