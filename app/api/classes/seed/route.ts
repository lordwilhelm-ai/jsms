import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const officialClasses = [
    { name: "Playroom 1", class_name: "Playroom 1", class_order: 1, level: "Pre-School" },
    { name: "Playroom 2", class_name: "Playroom 2", class_order: 2, level: "Pre-School" },
    { name: "KG 1", class_name: "KG 1", class_order: 3, level: "KG" },
    { name: "KG 2", class_name: "KG 2", class_order: 4, level: "KG" },
    { name: "Class 1", class_name: "Class 1", class_order: 5, level: "Lower Primary" },
    { name: "Class 2", class_name: "Class 2", class_order: 6, level: "Lower Primary" },
    { name: "Class 3", class_name: "Class 3", class_order: 7, level: "Lower Primary" },
    { name: "Class 4", class_name: "Class 4", class_order: 8, level: "Upper Primary" },
    { name: "Class 5", class_name: "Class 5", class_order: 9, level: "Upper Primary" },
    { name: "Class 6", class_name: "Class 6", class_order: 10, level: "Upper Primary" },
    { name: "JHS 1", class_name: "JHS 1", class_order: 11, level: "JHS" },
    { name: "JHS 2", class_name: "JHS 2", class_order: 12, level: "JHS" },
    { name: "JHS 3", class_name: "JHS 3", class_order: 13, level: "JHS" },
];

export async function POST() {
    try {
        const { error: deleteError } = await supabaseAdmin
            .from("classes")
            .delete()
            .neq("id", "00000000-0000-0000-0000-000000000000");

        if (deleteError) {
            throw new Error(deleteError.message);
        }

        const { error: insertError } = await supabaseAdmin
            .from("classes")
            .insert(officialClasses);

        if (insertError) {
            throw new Error(insertError.message);
        }

        return NextResponse.json({
            message: "Official classes loaded successfully.",
        });
    } catch (error) {
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : "Something went wrong.",
            },
            { status: 500 }
        );
    }
}
