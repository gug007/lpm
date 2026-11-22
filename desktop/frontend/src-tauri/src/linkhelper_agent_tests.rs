use super::imp::agent;
use plist::Value;

#[test]
fn the_agent_runs_the_helper_from_this_lpm() {
    let Value::Dictionary(dict) = agent("/Applications/lpm.app/Contents/MacOS/lpm", None) else {
        panic!("not a dictionary");
    };
    let args: Vec<_> = dict["ProgramArguments"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_string().unwrap())
        .collect();
    assert_eq!(
        args,
        ["/Applications/lpm.app/Contents/MacOS/lpm", "--link-helper"]
    );
    assert_eq!(dict["KeepAlive"].as_boolean(), Some(true));
    assert_eq!(dict["LimitLoadToSessionType"].as_string(), Some("Aqua"));
    assert!(dict.get("EnvironmentVariables").is_none());
}

#[test]
fn an_isolated_lpm_keeps_its_folder() {
    let Value::Dictionary(dict) = agent("/x/lpm", Some("/tmp/qa".into())) else {
        panic!("not a dictionary");
    };
    let env = dict["EnvironmentVariables"].as_dictionary().unwrap();
    assert_eq!(env["LPM_DIR"].as_string(), Some("/tmp/qa"));
}
