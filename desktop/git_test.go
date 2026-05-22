package main

import (
	"reflect"
	"testing"
)

func TestParseChangedFiles(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want []ChangedFile
	}{
		{
			name: "modified unstaged",
			in:   " M b.txt\x00",
			want: []ChangedFile{{Path: "b.txt", Status: "modified", Staged: false}},
		},
		{
			name: "modified staged and unstaged",
			in:   "MM file.txt\x00",
			want: []ChangedFile{{Path: "file.txt", Status: "modified", Staged: true}},
		},
		{
			name: "added staged",
			in:   "A  new.txt\x00",
			want: []ChangedFile{{Path: "new.txt", Status: "added", Staged: true}},
		},
		{
			name: "deleted unstaged",
			in:   " D gone.txt\x00",
			want: []ChangedFile{{Path: "gone.txt", Status: "deleted", Staged: false}},
		},
		{
			name: "untracked",
			in:   "?? untracked.txt\x00",
			want: []ChangedFile{{Path: "untracked.txt", Status: "untracked", Staged: false}},
		},
		{
			name: "untracked with spaces in name",
			in:   "?? has spaces.txt\x00",
			want: []ChangedFile{{Path: "has spaces.txt", Status: "untracked", Staged: false}},
		},
		{
			// Regression: the rename from-path chunk has no XY prefix and used
			// to be misparsed into a phantom entry with a corrupted path.
			name: "rename does not produce phantom entry",
			in:   "R  new_a.txt\x00a.txt\x00",
			want: []ChangedFile{{Path: "new_a.txt", Status: "renamed", Staged: true}},
		},
		{
			name: "copy does not produce phantom entry",
			in:   "C  dst.txt\x00src.txt\x00",
			want: []ChangedFile{{Path: "dst.txt", Status: "renamed", Staged: true}},
		},
		{
			// Regression: a rename followed by another file used to drop or
			// corrupt the trailing entry depending on path lengths.
			name: "rename followed by other entries",
			in:   " M b.txt\x00R  new_a.txt\x00a.txt\x00?? untracked.txt\x00",
			want: []ChangedFile{
				{Path: "b.txt", Status: "modified", Staged: false},
				{Path: "new_a.txt", Status: "renamed", Staged: true},
				{Path: "untracked.txt", Status: "untracked", Staged: false},
			},
		},
		{
			name: "multiple consecutive renames",
			in:   "R  a_new\x00a_old\x00R  b_new\x00b_old\x00 M c.txt\x00",
			want: []ChangedFile{
				{Path: "a_new", Status: "renamed", Staged: true},
				{Path: "b_new", Status: "renamed", Staged: true},
				{Path: "c.txt", Status: "modified", Staged: false},
			},
		},
		{
			name: "empty input",
			in:   "",
			want: []ChangedFile{},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseChangedFiles(tt.in)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("parseChangedFiles() = %+v, want %+v", got, tt.want)
			}
		})
	}
}
