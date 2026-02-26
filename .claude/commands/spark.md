Capture a spark — an interest or idea before it becomes a component proposal: $ARGUMENTS

A spark is NOT a task. It is NOT a component proposal. It is an observation, an interest, a signal that something might be worth exploring. Sparks live upstream of the Nursery.

## Process

1. Append to `src/data/spark-queue.jsonl` a JSON object with:
   - `id`: "SPARK-{next number}"
   - `timestamp`: current ISO timestamp
   - `description`: the full text from $ARGUMENTS
   - `source`: "gardener" (if the human initiated) or "agent" (if an agent noticed something)
   - `status`: "captured"
   - `context`: any relevant surrounding context from the conversation

2. Do NOT create a component spec
3. Do NOT enter the Nursery
4. Do NOT create any files in src/components/

Report: "Spark captured: {description}. When ready, use /create-component to plant it in the Nursery."
