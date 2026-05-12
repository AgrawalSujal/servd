import { Toast } from "@base-ui/react";
import { useState } from "react"
import { toast } from "sonner";

const useFetch = (cb) => {
    const [data, setData] = useState();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fn = async (...args) => {
        setLoading(true);
        try {
            const res = await cb(...args);
            setData(res);
            setError(null);
        } catch (err) {
            setError(err);
            toast.error(err.message || "An error occurred");
        } finally {
            setLoading(false);
        }
    }

    return { data, loading, error, fn };
}

export default useFetch;