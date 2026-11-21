# Planning timeout recovery

November 21, 2026

A reported hosted run stopped at query planning with HTTP 524 after roughly two minutes. A 524 indicates an upstream response timeout. The application previously treated a failed planning request as a fatal error, so web search never started.

Query planning now has a 30-second request deadline and zero automatic retries. A temporary inference timeout, connection failure or selected upstream 5xx response switches to a direct search of the user's original question. This fallback does not generate an answer or pretend that model planning succeeded. Activity includes the fallback reason, and the final report retains the planning limitation. Potentially stale prior readings are not reused on this path.

Authorization, rate-limit, quota and unrelated programming errors remain failures. Capacity reservations are not refunded or reset. Direct search uses the existing Tavily/search bounds, and subsequent synthesis and evidence validation still use the normal pipeline. Optional coverage checks also have a 30-second deadline. Later inference timeouts receive a readable service-timeout explanation instead of the raw upstream response.

Four new offline regression checks cover the 524/timeout fallback, zero inference retries, rejection of auth/quota bypasses, the actual research pipeline continuing into a mocked web search, and safe timeout messages. All 108 offline tests pass; TypeScript and the isolated Worker build/secret scan pass. No Tavily or Nebius request was made to validate this repair.

This change removes the fatal dependency on successful query planning. It does not establish that the upstream provider has recovered, guarantee a complete report during a provider outage, or remove the need for evidence review. A newly successful production research run has not been tested for this change.
