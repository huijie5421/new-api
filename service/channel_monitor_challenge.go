package service

import (
	"fmt"
	"math/rand"
	"regexp"
	"strconv"
	"time"
)

var challengeRand = rand.New(rand.NewSource(time.Now().UnixNano()))

// GenerateChallenge creates a random arithmetic challenge
func GenerateChallenge() *Challenge {
	a := challengeRand.Intn(ChallengeMaxNumber-ChallengeMinNumber+1) + ChallengeMinNumber
	b := challengeRand.Intn(ChallengeMaxNumber-ChallengeMinNumber+1) + ChallengeMinNumber

	return &Challenge{
		Question: fmt.Sprintf("What is %d + %d? Answer with only the number.", a, b),
		Answer:   a + b,
	}
}

// ValidateChallengeResponse checks if the response contains the correct answer
func ValidateChallengeResponse(responseText string, challenge *Challenge) bool {
	if challenge == nil {
		return true
	}

	// Extract numbers from response (look for the answer)
	re := regexp.MustCompile(`\b(\d+)\b`)
	matches := re.FindAllString(responseText, -1)

	if len(matches) == 0 {
		return false
	}

	// Check if any extracted number matches the answer
	answerStr := strconv.Itoa(challenge.Answer)
	for _, match := range matches {
		if match == answerStr {
			return true
		}
	}

	return false
}
