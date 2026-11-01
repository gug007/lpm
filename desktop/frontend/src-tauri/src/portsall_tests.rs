use super::*;

fn pane(project: &str, service: &str, title: &str) -> Owner {
    Owner::Pane {
        project: project.into(),
        service: service.into(),
        title: title.into(),
    }
}

fn rows(pairs: Vec<(i64, i64)>, owners: HashMap<i64, Owner>) -> Vec<ListeningPort> {
    let names = HashMap::from([
        (10, "node".to_string()),
        (20, "postgres".to_string()),
        (30, "lpm-desktop".to_string()),
    ]);
    attribute(
        pairs,
        |pid| owners.get(&pid).cloned(),
        &names,
        |pid| pid * 100,
        |name| ProjectFacts {
            label: format!("{name} label"),
            parent: if name == "shop-2" { "shop".into() } else { String::new() },
        },
    )
}

#[test]
fn a_server_on_both_stacks_is_one_row_and_rows_follow_port_order() {
    let out = rows(vec![(20, 5432), (10, 3000), (10, 3000)], HashMap::new());
    assert_eq!(out.iter().map(|r| r.port).collect::<Vec<_>>(), vec![3000, 5432]);
    assert_eq!(out[0].process, "node");
    assert_eq!(out[1].started_at, 2000);
}

#[test]
fn a_service_pane_names_its_project_copy_and_service() {
    let owners = HashMap::from([(10, pane("shop-2", "web", "web"))]);
    let out = rows(vec![(10, 3001)], owners);
    assert_eq!(out[0].project, "shop-2");
    assert_eq!(out[0].project_label, "shop-2 label");
    assert_eq!(out[0].parent, "shop");
    assert_eq!(out[0].service, "web");
    assert_eq!(out[0].terminal, "");
}

#[test]
fn a_terminal_tab_keeps_its_title_and_outside_ports_stay_unowned() {
    let owners = HashMap::from([(10, pane("shop", "", "npm run dev")), (1, Owner::Lpm)]);
    let out = rows(vec![(10, 8080), (20, 5432), (1, 7777), (30, 8765)], owners);
    let by_port = |p| out.iter().find(|r| r.port == p).unwrap();
    assert!(by_port(8765).own, "another copy of lpm is never a stray to kill");
    assert_eq!(by_port(8080).terminal, "npm run dev");
    assert_eq!(by_port(8080).service, "");
    assert_eq!(by_port(5432).project, "");
    assert!(!by_port(5432).own);
    assert!(by_port(7777).own);
}

#[test]
fn peer_rows_carry_the_marker_the_bridge_routes_by() {
    let row = ListeningPort {
        port: 3000,
        project: "shop-2".into(),
        parent: "shop".into(),
        ..Default::default()
    };
    let outside = ListeningPort {
        port: 5432,
        ..Default::default()
    };
    let out = as_peer_rows("0a1b2c3d", "mac-mini", vec![row, outside]);
    assert_eq!(out[0].project, "peer-0a1b2c3d-shop-2");
    assert_eq!(out[0].parent, "peer-0a1b2c3d-shop");
    assert_eq!(out[0].machine, "0a1b2c3d");
    assert_eq!(out[0].machine_name, "mac-mini");
    assert_eq!(out[1].project, "");
}

#[test]
fn lpm_is_known_by_its_binaries_on_every_platform() {
    assert!(is_lpm_process("lpm-desktop"));
    assert!(is_lpm_process("lpm-tailnet.exe"));
    assert!(is_lpm_process("LPM-Desktop.EXE"));
    assert!(!is_lpm_process("node"));
}

#[test]
fn rows_read_back_from_a_peer_answer() {
    let value = json!([{ "port": 3000, "pid": 7, "process": "node", "project": "shop" }]);
    let rows: Vec<ListeningPort> = serde_json::from_value(value).unwrap();
    assert_eq!(rows[0].project, "shop");
    assert_eq!(rows[0].started_at, 0);
}
