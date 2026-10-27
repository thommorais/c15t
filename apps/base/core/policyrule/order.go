package policyrule

const asciiOrder = " _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$0123456789abcdefghijklmnopqrstuvwxyz"

var primary = func() [0x7f]int8 {
	var p [0x7f]int8
	for i := range p {
		p[i] = -1
	}
	for i := range len(asciiOrder) {
		c := asciiOrder[i]
		p[c] = int8(i)
		if c >= 'a' && c <= 'z' {
			p[c-0x20] = int8(i)
		}
	}
	return p
}()

func isPrintableASCII(s string) bool {
	for i := range len(s) {
		if s[i] < 0x20 || s[i] > 0x7e {
			return false
		}
	}
	return true
}

func compareCanonical(left, right string) int {
	shared := min(len(left), len(right))
	caseDifference := 0
	for i := range shared {
		l, r := left[i], right[i]
		if l == r {
			continue
		}
		if d := int(primary[l]) - int(primary[r]); d != 0 {
			return d
		}
		if caseDifference == 0 {
			if l >= 'A' && l <= 'Z' {
				caseDifference = 1
			} else {
				caseDifference = -1
			}
		}
	}
	if len(left) != len(right) {
		return len(left) - len(right)
	}
	return caseDifference
}
