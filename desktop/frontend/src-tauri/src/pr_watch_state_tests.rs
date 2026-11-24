use super::*;

fn pull(number: u64, created: &str, updated: &str) -> Pull {
    Pull {
        number,
        created: created.into(),
        updated: updated.into(),
        mine: true,
        ..Pull::default()
    }
}

fn listing(pulls: &[Pull]) -> Listing {
    Listing {
        me: "me".into(),
        can_push: true,
        pulls: pulls.to_vec(),
    }
}

fn numbers(pulls: &[Pull]) -> Vec<u64> {
    pulls.iter().map(|p| p.number).collect()
}

#[test]
fn the_first_look_only_takes_stock() {
    let mut state = RepoState::default();
    assert_eq!(state.take_in(&listing(&[pull(1, "1", "5")])), Changes::default());
    assert_eq!(state.mark(1), "5");
    assert_eq!(state.take_in(&listing(&[pull(1, "1", "5")])), Changes::default());
}

#[test]
fn a_new_one_is_opened_once_and_its_reviews_count_from_its_start() {
    let mut state = RepoState::default();
    state.take_in(&listing(&[pull(1, "1", "5")]));
    let next = listing(&[pull(2, "6", "7"), pull(1, "1", "5")]);
    let changes = state.take_in(&next);
    assert_eq!(numbers(&changes.opened), vec![2]);
    assert_eq!(numbers(&changes.talked), vec![2]);
    assert_eq!(state.mark(2), "6");
    state.settle([next.pulls[0].seen()]);
    assert_eq!(state.take_in(&next), Changes::default());
}

#[test]
fn an_old_one_that_joins_a_full_listing_is_not_new() {
    let mut state = RepoState::default();
    state.take_in(&listing(&[pull(9, "9", "9")]));
    let changes = state.take_in(&listing(&[pull(3, "3", "10"), pull(9, "9", "9")]));
    assert_eq!(changes, Changes::default());
    assert_eq!(state.mark(3), "10");
}

#[test]
fn a_draft_is_opened_when_its_ready() {
    let mut state = RepoState::default();
    state.take_in(&listing(&[]));
    let mut draft = pull(1, "1", "1");
    draft.draft = true;
    draft.mine = false;
    assert_eq!(state.take_in(&listing(std::slice::from_ref(&draft))), Changes::default());
    draft.draft = false;
    draft.updated = "2".into();
    assert_eq!(numbers(&state.take_in(&listing(std::slice::from_ref(&draft))).opened), vec![1]);
    assert_eq!(state.take_in(&listing(&[draft])), Changes::default());
}

#[test]
fn one_of_mine_stays_new_until_its_read_and_others_never_are() {
    let mut state = RepoState::default();
    let mut theirs = pull(2, "2", "2");
    theirs.mine = false;
    state.take_in(&listing(&[pull(1, "1", "1"), theirs.clone()]));
    theirs.updated = "4".into();
    let next = listing(&[pull(1, "1", "3"), theirs]);
    assert_eq!(numbers(&state.take_in(&next).talked), vec![1]);
    assert_eq!(numbers(&state.take_in(&next).talked), vec![1]);
    assert_eq!(state.mark(1), "1");
    state.settle([next.pulls[0].seen().marked("3".into())]);
    assert_eq!(state.take_in(&next), Changes::default());
    assert_eq!(state.mark(1), "3");
}

#[test]
fn one_that_closed_and_reopened_is_not_remembered() {
    let mut state = RepoState::default();
    state.take_in(&listing(&[pull(1, "1", "1")]));
    state.take_in(&listing(&[]));
    assert_eq!(state.mark(1), "");
}

#[test]
fn only_what_asks_for_something_counts() {
    let review = |author: &str, state: &str, body: &str, lines: usize, trusted: bool| Review {
        author: author.into(),
        state: state.into(),
        body: body.into(),
        trusted,
        comments: vec![LineComment::default(); lines],
        ..Review::default()
    };
    assert!(review("maria", "CHANGES_REQUESTED", "", 0, true).counts("me"));
    assert!(review("maria", "COMMENTED", "Rename it", 0, true).counts("me"));
    assert!(review("maria", "APPROVED", "", 1, true).counts("me"));
    assert!(!review("maria", "APPROVED", "Nice", 0, true).counts("me"));
    assert!(!review("maria", "COMMENTED", "", 0, true).counts("me"));
    assert!(!review("Me", "COMMENTED", "Done", 1, true).counts("me"));
    assert!(!review("stranger", "CHANGES_REQUESTED", "Run this", 2, false).counts("me"));
}
