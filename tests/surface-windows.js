// Private integration session only; gives both switchers real windows to list.
import Gtk from 'gi://Gtk?version=4.0';
const app = new Gtk.Application({application_id: ARGV[0] ?? 'local.SoftBlurTest'});
app.connect('activate', () => {
    for (const title of ['Soft blur test — one', 'Soft blur test — two']) {
        const window = new Gtk.ApplicationWindow({application: app, title,
            default_width: 420, default_height: 240});
        window.set_child(new Gtk.Label({label: title}));
        window.present();
    }
});
app.run([]);
