// Private compositor fixture: dense, stationary client-rendered text.
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
const app = new Gtk.Application({application_id: 'local.TextBackdropTest'});
app.connect('activate', () => {
    const css = new Gtk.CssProvider();
    css.load_from_string('window { background: white; } label { color: black; font: 16px monospace; }');
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), css,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    const window = new Gtk.ApplicationWindow({application: app, title: 'Text backdrop test',
        default_width: 1380, default_height: 900});
    const scroll = new Gtk.ScrolledWindow();
    scroll.set_child(new Gtk.Label({label: ('Text behind terminal 0123456789 MWMWMW '.repeat(4) + '\n').repeat(50),
        xalign: 0, yalign: 0}));
    window.set_child(scroll);
    window.present();
});
app.run([]);
