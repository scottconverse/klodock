//! Minimal keychain round-trip test

fn main() {
    use keyring::Entry;

    let service = "clawpad";
    let key = "_spike_kc2_test";
    let value = "test-secret-123";
    let target = format!("{service}.{key}");

    // Store with one entry
    let e1 = Entry::new_with_target(&target, service, key).unwrap();
    e1.set_password(value).unwrap();
    println!("Stored via e1");

    // Retrieve with same entry
    let r1 = e1.get_password();
    println!("Retrieve via e1: {:?}", r1);

    // Retrieve with new entry, same target
    let e2 = Entry::new_with_target(&target, service, key).unwrap();
    let r2 = e2.get_password();
    println!("Retrieve via e2 (same target): {:?}", r2);

    // Retrieve with Entry::new (different target)
    let e3 = Entry::new(service, key).unwrap();
    let r3 = e3.get_password();
    println!("Retrieve via e3 (Entry::new): {:?}", r3);

    // What target does Entry::new actually use?
    // Let's try various patterns
    for t in &[
        format!("{service}.{key}"),
        format!("{service}/{key}"),
        format!("{key}@{service}"),
        key.to_string(),
        format!("{service}:{key}"),
    ] {
        let e = Entry::new_with_target(t, service, key).unwrap();
        let r = e.get_password();
        println!("Target '{}': {:?}", t, r.is_ok());
    }

    // Cleanup
    let _ = e1.delete_credential();
    println!("\nDone");
}
