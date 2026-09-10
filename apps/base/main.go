package main

import (
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/spf13/cobra"

	"thom/api"
	"thom/core/apikey"
	_ "thom/migrations"
)

func main() {
	app := pocketbase.New()

	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: isGoRun,
	})

	app.RootCmd.AddCommand(newAPIKeyCmd(app))

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		api.Register(app, se, api.DefaultConfig())
		return se.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

func newAPIKeyCmd(app core.App) *cobra.Command {
	var tenantID, name, env string

	cmd := &cobra.Command{
		Use:   "apikey:create",
		Short: "Create an API key for a tenant",
		RunE: func(_ *cobra.Command, _ []string) error {
			if tenantID == "" {
				return fmt.Errorf("--tenant is required")
			}

			keyEnv := apikey.Env(env)
			if keyEnv != apikey.EnvLive && keyEnv != apikey.EnvTest {
				return fmt.Errorf("--env must be live or test")
			}

			if err := app.Bootstrap(); err != nil {
				return err
			}

			key, err := apikey.Generate(keyEnv)
			if err != nil {
				return err
			}

			collection, err := app.FindCollectionByNameOrId("apiKey")
			if err != nil {
				return err
			}

			record := core.NewRecord(collection)
			record.Set("tenantId", tenantID)
			record.Set("name", name)
			record.Set("keyHash", key.Hash)
			record.Set("env", string(keyEnv))
			record.Set("revoked", false)

			if err := app.Save(record); err != nil {
				return err
			}

			fmt.Printf("%s\n", key.Secret)
			return nil
		},
	}

	cmd.Flags().StringVar(&tenantID, "tenant", "", "tenant id")
	cmd.Flags().StringVar(&name, "name", "", "key label")
	cmd.Flags().StringVar(&env, "env", "live", "live or test")

	return cmd
}
