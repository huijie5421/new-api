package service

// GenerateChallenge returns a minimal "hi" probe prompt. A channel is considered
// healthy if it returns any non-empty completion (streaming or non-streaming) —
// we do not assert the model's answer, only that it is alive and responding.
func GenerateChallenge() *Challenge {
	return &Challenge{
		Question: "hi",
		Answer:   0,
	}
}
