import { auth, currentUser } from "@clerk/nextjs/server";

const STRAPI_URL =
    process.env.NEXT_PUBLIC_STRAPI_URL || "http://localhost:1337";
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN;
// Optional: comma-separated list of Clerk plan ids that should be treated as Pro
const CLERK_PRO_PLAN_IDS = process.env.CLERK_PRO_PLAN_IDS || "";
// Optional: comma-separated list of Clerk feature ids that indicate Pro
const CLERK_PRO_FEATURES = process.env.CLERK_PRO_FEATURES || "";

export const checkUser = async () => {
    const user = await currentUser();

    if (!user) {
        console.log("No User found");
        return null;
    }

    if (!STRAPI_API_TOKEN) {
        console.error("❌ STRAPI_API_TOKEN is missing in .env.local");
        return null;
    }

    // Check if user has Pro plan. Prefer `auth().has()` but fall back to user metadata.
    let subscriptionTier = "free";
    try {
        const authRes = await auth();
        console.debug("checkUser: auth() ->", authRes);

        if (authRes) {
            if (typeof authRes.has === "function") {
                try {
                    subscriptionTier = authRes.has({ plan: "pro" }) ? "pro" : "free";
                } catch (e) {
                    console.debug("checkUser: auth().has threw", e?.message || e);
                }
            }

            // Also inspect session claims `pla` which Clerk uses for plan identifiers
            try {
                const pla = authRes.sessionClaims?.pla;
                if (pla) {
                    console.debug("checkUser: sessionClaims.pla ->", pla);
                    // Config-driven detection: match against CLERK_PRO_PLAN_IDS
                    const proPlanIds = CLERK_PRO_PLAN_IDS.split(",").map(s => s.trim()).filter(Boolean);
                    if (proPlanIds.length > 0) {
                        if (proPlanIds.includes(pla) || proPlanIds.some(id => pla.includes(id))) {
                            subscriptionTier = "pro";
                        }
                    } else {
                        if (typeof pla === "string" && pla.toLowerCase().includes("pro")) {
                            subscriptionTier = "pro";
                        } else if (typeof pla === "string" && pla.toLowerCase().includes("free")) {
                            subscriptionTier = "free";
                        }
                    }
                }

                // Feature-based detection (e.g., pro plan grants certain features)
                try {
                    const fea = authRes.sessionClaims?.fea; // comma-separated features
                    if (fea) {
                        console.debug("checkUser: sessionClaims.fea ->", fea);
                        const proFeatures = CLERK_PRO_FEATURES.split(",").map(s => s.trim()).filter(Boolean);
                        if (proFeatures.length > 0) {
                            const feaList = fea.split(",").map(s => s.trim());
                            if (proFeatures.some(f => feaList.includes(f) || feaList.some(ff => ff.includes(f)))) {
                                subscriptionTier = "pro";
                            }
                        }
                    }
                } catch (e) {
                    console.debug("checkUser: feature inspect failed", e?.message || e);
                }
            } catch (e) {
                console.debug("checkUser: sessionClaims.pla inspect failed", e?.message || e);
            }
        }
    } catch (e) {
        console.debug("checkUser: auth() failed", e?.message || e);
    }

    // Fallback: check common Clerk user metadata locations
    try {
        const planFromPublic = user?.publicMetadata?.plan;
        const planFromPrivate = user?.privateMetadata?.plan;
        const planFromUnsafe = user?.unsafeMetadata?.plan;
        console.debug("checkUser: user metadata ->", {
            public: planFromPublic,
            private: planFromPrivate,
            unsafe: planFromUnsafe,
        });

        if (planFromPublic === "pro" || planFromPrivate === "pro" || planFromUnsafe === "pro") {
            subscriptionTier = "pro";
        }
    } catch (e) {
        console.debug("checkUser: metadata check failed", e?.message || e);
    }

    console.log("checkUser: resolved subscriptionTier ->", subscriptionTier);

    try {
        // Check if user exists in Strapi
        const existingUserResponse = await fetch(
            `${STRAPI_URL}/api/users?filters[clerkId][$eq]=${user.id}`,
            {
                headers: {
                    Authorization: `Bearer ${STRAPI_API_TOKEN}`,
                },
                cache: "no-store",
            }
        );

        if (!existingUserResponse.ok) {
            const errorText = await existingUserResponse.text();
            console.error("Strapi error response:", errorText);
            return null;
        }

        const existingUserData = await existingUserResponse.json();

        if (existingUserData.length > 0) {
            const existingUser = existingUserData[0];

            // Update subscription tier if changed
            if (existingUser.subscriptionTier !== subscriptionTier) {
                await fetch(`${STRAPI_URL}/api/users/${existingUser.id}`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${STRAPI_API_TOKEN}`,
                    },
                    body: JSON.stringify({ subscriptionTier }),
                });
            }

            return { ...existingUser, subscriptionTier };
        }

        // Get authenticated role
        const rolesResponse = await fetch(
            `${STRAPI_URL}/api/users-permissions/roles`,
            {
                headers: {
                    Authorization: `Bearer ${STRAPI_API_TOKEN}`,
                },
            }
        );

        const rolesData = await rolesResponse.json();
        const authenticatedRole = rolesData.roles.find(
            (role) => role.type === "authenticated"
        );

        if (!authenticatedRole) {
            console.error("❌ Authenticated role not found");
            return null;
        }

        // Create new user
        const userData = {
            username:
                user.username || user.emailAddresses[0].emailAddress.split("@")[0],
            email: user.emailAddresses[0].emailAddress,
            password: `clerk_managed_${user.id}_${Date.now()}`,
            confirmed: true,
            blocked: false,
            role: authenticatedRole.id,
            clerkId: user.id,
            firstName: user.firstName || "",
            lastName: user.lastName || "",
            imageUrl: user.imageUrl || "",
            subscriptionTier,
        };

        const newUserResponse = await fetch(`${STRAPI_URL}/api/users`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${STRAPI_API_TOKEN}`,
            },
            body: JSON.stringify(userData),
        });

        if (!newUserResponse.ok) {
            const errorText = await newUserResponse.text();
            console.error("❌ Error creating user:", errorText);
            return null;
        }

        const newUser = await newUserResponse.json();
        return newUser;
    } catch (error) {
        console.error("❌ Error in checkUser:", error.message);
        return null;
    }
};